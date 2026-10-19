/**
 * Field-parity tests for the WhatsApp, Facebook, and X source adapters.
 *
 * Verifies that attachment shapes, replyTo, delivery updates, raw payloads,
 * and new API methods (markRead, react, deleteMessages) all work correctly.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  whatsappWebhookToLinks,
  whatsappReactionsFromMessages,
  whatsappStatusesToUpdates,
  createWhatsAppCloudLive,
} from '../src/sources/whatsapp.js';
import {
  facebookWebhookToLinks,
  facebookDeliveryFromWebhook,
  createFacebookLive,
} from '../src/sources/facebook.js';
import { xUpdatesToLinks, createXLive } from '../src/sources/x.js';

/** Minimal fake fetch that records calls and returns a JSON response. */
const makeFetch = (responseData = {}) => {
  const calls = [];
  const fn = async (url, init = {}) => {
    calls.push({ url, init });
    const text = JSON.stringify(responseData);
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => text,
    };
  };
  fn.calls = calls;
  return fn;
};

// ---------------------------------------------------------------------------
// WhatsApp webhook parsing
// ---------------------------------------------------------------------------

describe('whatsappWebhookToLinks', () => {
  it('image attachment produces kind photo', () => {
    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    id: 'wamid.img',
                    from: '1234567890',
                    type: 'image',
                    timestamp: '1700000000',
                    image: {
                      url: 'https://example.com/img.jpg',
                      mime_type: 'image/jpeg',
                      caption: 'nice',
                    },
                  },
                ],
              },
            },
          ],
        },
      ],
    };
    const links = whatsappWebhookToLinks(payload);
    assert.equal(links.length, 1);
    assert.equal(links[0].attachments[0].kind, 'photo');
    assert.equal(links[0].attachments[0].url, 'https://example.com/img.jpg');
    assert.equal(links[0].attachments[0].caption, 'nice');
  });

  it('location attachment produces kind location', () => {
    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    id: 'wamid.loc',
                    from: '1234567890',
                    type: 'location',
                    timestamp: '1700000001',
                    location: {
                      latitude: 51.5,
                      longitude: -0.1,
                      name: 'London',
                    },
                  },
                ],
              },
            },
          ],
        },
      ],
    };
    const links = whatsappWebhookToLinks(payload);
    assert.equal(links.length, 1);
    assert.equal(links[0].attachments[0].kind, 'location');
    assert.equal(links[0].attachments[0].lat, 51.5);
    assert.equal(links[0].attachments[0].title, 'London');
  });

  it('reply context produces replyTo', () => {
    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    id: 'wamid.reply',
                    from: '1234567890',
                    type: 'text',
                    timestamp: '1700000002',
                    text: { body: 'got it' },
                    context: { id: 'wamid.original', from: '9876543210' },
                  },
                ],
              },
            },
          ],
        },
      ],
    };
    const links = whatsappWebhookToLinks(payload);
    assert.equal(links.length, 1);
    assert.equal(links[0].replyTo, 'wamid.original');
  });

  it('reaction messages are skipped', () => {
    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    id: 'wamid.react',
                    from: '1234567890',
                    type: 'reaction',
                    timestamp: '1700000003',
                    reaction: { message_id: 'wamid.target', emoji: '👍' },
                  },
                ],
              },
            },
          ],
        },
      ],
    };
    const links = whatsappWebhookToLinks(payload);
    assert.equal(links.length, 0);
  });

  it('outgoing is false for webhook messages', () => {
    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    id: 'wamid.txt',
                    from: '1234567890',
                    type: 'text',
                    timestamp: '1700000004',
                    text: { body: 'hi' },
                  },
                ],
              },
            },
          ],
        },
      ],
    };
    const links = whatsappWebhookToLinks(payload);
    assert.equal(links[0].outgoing, false);
  });
});

// ---------------------------------------------------------------------------
// whatsappStatusesToUpdates
// ---------------------------------------------------------------------------

describe('whatsappStatusesToUpdates', () => {
  it('produces correct delivery values and ids', () => {
    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                statuses: [
                  {
                    id: 'wamid.abc',
                    status: 'delivered',
                    timestamp: '1700000010',
                  },
                  { id: 'wamid.def', status: 'read', timestamp: '1700000011' },
                  { id: 'wamid.ghi', status: 'sent', timestamp: '1700000012' },
                ],
              },
            },
          ],
        },
      ],
    };
    const updates = whatsappStatusesToUpdates(payload);
    assert.equal(updates.length, 3);
    assert.equal(updates[0].id, 'msg:whatsapp:wamid.abc');
    assert.equal(updates[0].delivery, 'delivered');
    assert.equal(updates[1].delivery, 'read');
    assert.equal(updates[2].delivery, 'sent');
    assert.equal(updates[0].at, '1700000010');
  });
});

// ---------------------------------------------------------------------------
// whatsappReactionsFromMessages
// ---------------------------------------------------------------------------

describe('whatsappReactionsFromMessages', () => {
  it('extracts targetId and emoji from reaction messages', () => {
    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    id: 'wamid.r1',
                    from: '1234567890',
                    type: 'reaction',
                    timestamp: '1700000020',
                    reaction: { message_id: 'wamid.target', emoji: '👍' },
                  },
                  {
                    id: 'wamid.r2',
                    from: '1234567890',
                    type: 'reaction',
                    timestamp: '1700000021',
                    reaction: { message_id: 'wamid.other', emoji: '❤️' },
                  },
                ],
              },
            },
          ],
        },
      ],
    };
    const reactions = whatsappReactionsFromMessages(payload);
    assert.equal(reactions.length, 2);
    assert.equal(reactions[0].targetId, 'wamid.target');
    assert.equal(reactions[0].emoji, '👍');
    assert.equal(reactions[1].targetId, 'wamid.other');
    assert.equal(reactions[1].emoji, '❤️');
  });
});

// ---------------------------------------------------------------------------
// Facebook webhook parsing
// ---------------------------------------------------------------------------

describe('facebookWebhookToLinks', () => {
  it('sticker_id produces sticker object', () => {
    const payload = {
      entry: [
        {
          messaging: [
            {
              sender: { id: 'user1' },
              recipient: { id: 'page1' },
              timestamp: 1700000030,
              message: { mid: 'mid.sticker', sticker_id: 369239263222822 },
            },
          ],
        },
      ],
    };
    const links = facebookWebhookToLinks(payload);
    assert.equal(links.length, 1);
    assert.equal(links[0].sticker.id, '369239263222822');
    assert.equal(links[0].sticker.pack, null);
  });

  it('image attachment produces kind photo', () => {
    const payload = {
      entry: [
        {
          messaging: [
            {
              sender: { id: 'user2' },
              recipient: { id: 'page1' },
              timestamp: 1700000040,
              message: {
                mid: 'mid.img',
                attachments: [
                  {
                    type: 'image',
                    payload: { url: 'https://example.com/photo.jpg' },
                  },
                ],
              },
            },
          ],
        },
      ],
    };
    const links = facebookWebhookToLinks(payload);
    assert.equal(links.length, 1);
    assert.equal(links[0].attachments[0].kind, 'photo');
    assert.equal(links[0].attachments[0].url, 'https://example.com/photo.jpg');
  });

  it('deleted message produces deleted true', () => {
    const payload = {
      entry: [
        {
          messaging: [
            {
              sender: { id: 'user3' },
              recipient: { id: 'page1' },
              timestamp: 1700000050,
              message: { mid: 'mid.del', is_deleted: true },
            },
          ],
        },
      ],
    };
    const links = facebookWebhookToLinks(payload);
    assert.equal(links.length, 1);
    assert.equal(links[0].deleted, true);
  });

  it('raw is the message object', () => {
    const payload = {
      entry: [
        {
          messaging: [
            {
              sender: { id: 'user4' },
              recipient: { id: 'page1' },
              timestamp: 1700000060,
              message: { mid: 'mid.raw', text: 'hello' },
            },
          ],
        },
      ],
    };
    const links = facebookWebhookToLinks(payload);
    assert.ok(links[0].raw);
    assert.equal(links[0].raw.mid, 'mid.raw');
  });
});

// ---------------------------------------------------------------------------
// facebookDeliveryFromWebhook
// ---------------------------------------------------------------------------

describe('facebookDeliveryFromWebhook', () => {
  it('delivery watermark produces delivered status', () => {
    const payload = {
      entry: [
        {
          messaging: [
            {
              sender: { id: 'user1' },
              recipient: { id: 'page1' },
              delivery: { watermark: 1700000070 },
            },
          ],
        },
      ],
    };
    const updates = facebookDeliveryFromWebhook(payload);
    assert.equal(updates.length, 1);
    assert.equal(updates[0].delivery, 'delivered');
  });

  it('read watermark produces read status', () => {
    const payload = {
      entry: [
        {
          messaging: [
            {
              sender: { id: 'user2' },
              recipient: { id: 'page1' },
              read: { watermark: 1700000080 },
            },
          ],
        },
      ],
    };
    const updates = facebookDeliveryFromWebhook(payload);
    assert.equal(updates.length, 1);
    assert.equal(updates[0].delivery, 'read');
  });
});

// ---------------------------------------------------------------------------
// X adapter parsing
// ---------------------------------------------------------------------------

describe('xUpdatesToLinks', () => {
  it('DM event produces raw', () => {
    const payload = {
      data: [
        {
          id: '1234',
          dm_conversation_id: 'conv:123',
          sender_id: 'user1',
          text: 'hello',
          created_at: '2024-01-01T00:00:00Z',
          event_type: 'MessageCreate',
        },
      ],
    };
    const links = xUpdatesToLinks(payload);
    assert.equal(links.length, 1);
    assert.ok(links[0].raw);
    assert.equal(links[0].raw.id, '1234');
  });

  it('DM with reply_to produces replyTo', () => {
    const payload = {
      data: [
        {
          id: '5678',
          dm_conversation_id: 'conv:123',
          sender_id: 'user1',
          text: 'reply',
          created_at: '2024-01-01T00:00:01Z',
          event_type: 'MessageCreate',
          reply_to: { id: '1111' },
        },
      ],
    };
    const links = xUpdatesToLinks(payload);
    assert.equal(links[0].replyTo, '1111');
  });

  it('DM without reply fields has null replyTo', () => {
    const payload = {
      data: [
        {
          id: '9999',
          dm_conversation_id: 'conv:999',
          sender_id: 'user2',
          text: 'no reply',
          created_at: '2024-01-02T00:00:00Z',
          event_type: 'MessageCreate',
        },
      ],
    };
    const links = xUpdatesToLinks(payload);
    assert.equal(links[0].replyTo, null);
  });
});

// ---------------------------------------------------------------------------
// API method: WhatsApp markRead
// ---------------------------------------------------------------------------

describe('createWhatsAppCloudLive markRead', () => {
  it('sends status read with correct message_id', async () => {
    const fetch = makeFetch({ messages: [{ id: 'wamid.ack' }] });
    const wa = createWhatsAppCloudLive({
      token: 'test-token',
      phoneNumberId: '12345',
      fetchImpl: fetch,
    });
    await wa.markRead({ id: 'wamid.msg1' });
    assert.equal(fetch.calls.length, 1);
    const body = JSON.parse(fetch.calls[0].init.body);
    assert.equal(body.status, 'read');
    assert.equal(body.message_id, 'wamid.msg1');
    assert.equal(body.messaging_product, 'whatsapp');
  });

  it('extracts id from link.id', async () => {
    const fetch = makeFetch({});
    const wa = createWhatsAppCloudLive({
      token: 'tok',
      phoneNumberId: '99',
      fetchImpl: fetch,
    });
    await wa.markRead({ link: { id: 'msg:whatsapp:wamid.xyz' } });
    const body = JSON.parse(fetch.calls[0].init.body);
    assert.equal(body.message_id, 'wamid.xyz');
  });

  it('throws when no id provided', async () => {
    const wa = createWhatsAppCloudLive({ token: 'tok', phoneNumberId: '99' });
    await assert.rejects(() => wa.markRead({}), /requires a message id/);
  });
});

// ---------------------------------------------------------------------------
// API method: WhatsApp react
// ---------------------------------------------------------------------------

describe('createWhatsAppCloudLive react', () => {
  it('sends reaction with correct message_id and emoji', async () => {
    const fetch = makeFetch({});
    const wa = createWhatsAppCloudLive({
      token: 'test-token',
      phoneNumberId: '12345',
      fetchImpl: fetch,
    });
    await wa.react({ chat: '79001234567', id: 'wamid.msg2', emoji: '🎉' });
    assert.equal(fetch.calls.length, 1);
    const body = JSON.parse(fetch.calls[0].init.body);
    assert.equal(body.to, '79001234567');
    assert.equal(body.recipient_type, 'individual');
    assert.equal(body.type, 'reaction');
    assert.equal(body.reaction.message_id, 'wamid.msg2');
    assert.equal(body.reaction.emoji, '🎉');
    assert.equal(body.messaging_product, 'whatsapp');
  });

  it('defaults emoji to empty string when omitted', async () => {
    const fetch = makeFetch({});
    const wa = createWhatsAppCloudLive({
      token: 'tok',
      phoneNumberId: '99',
      fetchImpl: fetch,
    });
    await wa.react({ chat: '7900', id: 'wamid.msg3' });
    const body = JSON.parse(fetch.calls[0].init.body);
    assert.equal(body.reaction.emoji, '');
  });
});

// ---------------------------------------------------------------------------
// API method: Facebook markRead
// ---------------------------------------------------------------------------

describe('createFacebookLive markRead', () => {
  it('sends mark_seen with correct recipient', async () => {
    const fetch = makeFetch({ result: 'success' });
    const fb = createFacebookLive({
      token: 'page-token',
      pageId: 'page123',
      fetchImpl: fetch,
    });
    await fb.markRead({ chat: 'psid-user1' });
    assert.equal(fetch.calls.length, 1);
    const body = JSON.parse(fetch.calls[0].init.body);
    assert.equal(body.sender_action, 'mark_seen');
    assert.equal(body.recipient.id, 'psid-user1');
  });

  it('extracts psid from link.chat', async () => {
    const fetch = makeFetch({});
    const fb = createFacebookLive({
      token: 'tok',
      pageId: 'pg',
      fetchImpl: fetch,
    });
    await fb.markRead({ link: { chat: 'psid-user2' } });
    const body = JSON.parse(fetch.calls[0].init.body);
    assert.equal(body.recipient.id, 'psid-user2');
  });

  it('throws when no psid provided', async () => {
    const fb = createFacebookLive({ token: 'tok', pageId: 'pg' });
    await assert.rejects(() => fb.markRead({}), /requires psid/);
  });
});

// ---------------------------------------------------------------------------
// API method: X deleteMessages
// ---------------------------------------------------------------------------

describe('createXLive deleteMessages', () => {
  it('sends DELETE for each id and returns count', async () => {
    const fetch = makeFetch({});
    const x = createXLive({
      token: 'bearer-token',
      fetchImpl: fetch,
    });
    const result = await x.deleteMessages({ ids: ['dm1', 'dm2'] });
    assert.equal(fetch.calls.length, 2);
    assert.equal(fetch.calls[0].init.method, 'DELETE');
    assert.ok(String(fetch.calls[0].url).includes('/2/dm_events/dm1'));
    assert.ok(String(fetch.calls[1].url).includes('/2/dm_events/dm2'));
    assert.equal(result.ok, true);
    assert.equal(result.deleted, 2);
  });

  it('extracts ids from links array', async () => {
    const fetch = makeFetch({});
    const x = createXLive({ token: 'tok', fetchImpl: fetch });
    const links = [{ id: 'msg:x:dm-aaa' }, { id: 'msg:x:dm-bbb' }];
    const result = await x.deleteMessages({ links });
    assert.equal(result.deleted, 2);
    assert.ok(String(fetch.calls[0].url).includes('/2/dm_events/dm-aaa'));
  });

  it('returns zero when no ids provided', async () => {
    const fetch = makeFetch({});
    const x = createXLive({ token: 'tok', fetchImpl: fetch });
    const result = await x.deleteMessages({ ids: [] });
    assert.equal(result.deleted, 0);
    assert.equal(fetch.calls.length, 0);
  });
});
