import { describe, it, expect } from 'test-anywhere';
import {
  vkSource,
  VK_REACTION_EMOJI_TO_ID,
  createVkLive,
} from '../src/sources/vk.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeArchive = (convExtra, messages) => ({
  conversations: [{ messages, ...convExtra }],
});

const makeMockFetch = (captured) => async (urlObj, init) => {
  captured.url = urlObj.toString();
  if (init?.body instanceof URLSearchParams) {
    captured.params = Object.fromEntries(init.body.entries());
  }
  return {
    ok: true,
    text: async () => JSON.stringify({ response: 1 }),
  };
};

// ---------------------------------------------------------------------------
// parseArchive — chatType
// ---------------------------------------------------------------------------

describe('vkSource.parseArchive chatType', () => {
  it('maps peer_id >= 2000000000 to chatType group', async () => {
    const archive = makeArchive({ peer: { id: 2000000001 } }, [
      { id: 1, from_id: 100, date: 1700000000, text: 'hi' },
    ]);
    const links = await vkSource.parseArchive(archive);
    expect(links[0].chatType).toBe('group');
  });

  it('maps peer_id < 0 to chatType channel', async () => {
    const archive = makeArchive({ peer: { id: -12345 } }, [
      { id: 2, from_id: 100, date: 1700000000, text: 'hello' },
    ]);
    const links = await vkSource.parseArchive(archive);
    expect(links[0].chatType).toBe('channel');
  });
});

// ---------------------------------------------------------------------------
// parseArchive — attachments
// ---------------------------------------------------------------------------

describe('vkSource.parseArchive attachments', () => {
  it('maps photo attachment to kind photo', async () => {
    const archive = makeArchive({ peer: { id: 123 } }, [
      {
        id: 3,
        from_id: 100,
        date: 1700000000,
        text: '',
        attachments: [
          {
            type: 'photo',
            photo: {
              sizes: [
                { url: 'http://a.com/s.jpg', width: 75, height: 56 },
                { url: 'http://a.com/m.jpg', width: 130, height: 97 },
                { url: 'http://a.com/x.jpg', width: 604, height: 452 },
              ],
            },
          },
        ],
      },
    ]);
    const links = await vkSource.parseArchive(archive);
    expect(links[0].attachments[0].kind).toBe('photo');
    expect(links[0].attachments[0].width).toBe(604);
  });

  it('maps doc type 5 to kind voice', async () => {
    const archive = makeArchive({ peer: { id: 123 } }, [
      {
        id: 4,
        from_id: 100,
        date: 1700000000,
        text: '',
        attachments: [
          {
            type: 'doc',
            doc: {
              type: 5,
              url: 'https://vk.com/voice.ogg',
              title: 'voice001.ogg',
              size: 12345,
            },
          },
        ],
      },
    ]);
    const links = await vkSource.parseArchive(archive);
    expect(links[0].attachments[0].kind).toBe('voice');
  });
});

// ---------------------------------------------------------------------------
// parseArchive — forwardedFrom, outgoing, edited
// ---------------------------------------------------------------------------

describe('vkSource.parseArchive forwarded/outgoing/edited', () => {
  it('maps fwd_messages to forwardedFrom with id', async () => {
    const archive = makeArchive({ peer: { id: 123 } }, [
      {
        id: 5,
        from_id: 100,
        date: 1700000000,
        text: '',
        fwd_messages: [{ from_id: 999, text: 'fwd', date: 1699000000 }],
      },
    ]);
    const links = await vkSource.parseArchive(archive);
    expect(links[0].forwardedFrom).toEqual({ id: '999' });
  });

  it('maps out: 1 to outgoing: true', async () => {
    const archive = makeArchive({ peer: { id: 123 } }, [
      { id: 6, from_id: 100, out: 1, date: 1700000000, text: 'sent' },
    ]);
    const links = await vkSource.parseArchive(archive);
    expect(links[0].outgoing).toBe(true);
  });

  it('maps update_time to edited ISO string', async () => {
    const archive = makeArchive({ peer: { id: 123 } }, [
      {
        id: 7,
        from_id: 100,
        date: 1700000000,
        update_time: 1700001000,
        text: 'edited',
      },
    ]);
    const links = await vkSource.parseArchive(archive);
    expect(links[0].edited).toBe(new Date(1700001000 * 1000).toISOString());
  });
});

// ---------------------------------------------------------------------------
// Live API action methods
// ---------------------------------------------------------------------------

describe('createVkLive action methods', () => {
  it('editMessage calls messages.edit with correct params', async () => {
    const captured = {};
    const vk = createVkLive({
      token: 'test-token',
      fetchImpl: makeMockFetch(captured),
    });
    await vk.editMessage({ chat: '100500', id: '42', text: 'new text' });
    expect(captured.url).toContain('/method/messages.edit');
    expect(captured.params.peer_id).toBe('100500');
    expect(captured.params.message_id).toBe('42');
    expect(captured.params.message).toBe('new text');
  });

  it('deleteMessages calls messages.delete with correct params', async () => {
    const captured = {};
    const vk = createVkLive({
      token: 'test-token',
      fetchImpl: makeMockFetch(captured),
    });
    await vk.deleteMessages({
      chat: '100500',
      ids: ['10', '11'],
      revoke: true,
    });
    expect(captured.url).toContain('/method/messages.delete');
    expect(captured.params.peer_id).toBe('100500');
    expect(captured.params.message_ids).toBe('10,11');
    expect(captured.params.delete_for_all).toBe('1');
  });

  it('markRead calls messages.markAsRead with correct params', async () => {
    const captured = {};
    const vk = createVkLive({
      token: 'test-token',
      fetchImpl: makeMockFetch(captured),
    });
    await vk.markRead({ chat: '100500', maxId: '99' });
    expect(captured.url).toContain('/method/messages.markAsRead');
    expect(captured.params.peer_id).toBe('100500');
    expect(captured.params.start_message_id).toBe('99');
  });

  it('react with ❤️ calls messages.sendReaction with reaction_id 1', async () => {
    const captured = {};
    const vk = createVkLive({
      token: 'test-token',
      fetchImpl: makeMockFetch(captured),
    });
    await vk.react({
      chat: '100500',
      id: '9001',
      emoji: '❤️',
      link: {
        id: 'msg:vk:9001',
        chat: '100500',
        raw: { conversation_message_id: 55 },
      },
    });
    expect(captured.url).toContain('/method/messages.sendReaction');
    expect(captured.params.peer_id).toBe('100500');
    expect(captured.params.cmid).toBe('55');
    expect(captured.params.reaction_id).toBe('1');
  });

  it('react with unsupported emoji throws error with code unsupported-reaction', async () => {
    const captured = {};
    const vk = createVkLive({
      token: 'test-token',
      fetchImpl: makeMockFetch(captured),
    });
    let threw = null;
    try {
      await vk.react({
        chat: '100500',
        id: '9001',
        emoji: '🦄',
        link: {
          id: 'msg:vk:9001',
          chat: '100500',
          raw: { conversation_message_id: 55 },
        },
      });
    } catch (err) {
      threw = err;
    }
    expect(threw).not.toBe(null);
    expect(threw.code).toBe('unsupported-reaction');
  });

  it('react with empty emoji calls messages.deleteReaction', async () => {
    const captured = {};
    const vk = createVkLive({
      token: 'test-token',
      fetchImpl: makeMockFetch(captured),
    });
    await vk.react({
      chat: '100500',
      id: '9001',
      emoji: '',
      link: {
        id: 'msg:vk:9001',
        chat: '100500',
        raw: { conversation_message_id: 55 },
      },
    });
    expect(captured.url).toContain('/method/messages.deleteReaction');
    expect(captured.params.peer_id).toBe('100500');
    expect(captured.params.cmid).toBe('55');
  });

  it('react without the chat number of the message hands over to the web app', async () => {
    const vk = createVkLive({ token: 't', fetchImpl: makeMockFetch({}) });
    let threw = null;
    try {
      await vk.react({ chat: '100500', id: '9001', emoji: '❤️' });
    } catch (err) {
      threw = err;
    }
    expect(threw.code).toBe('unsupported-action');
  });

  it('forwardMessages calls messages.send with forward params', async () => {
    const captured = {};
    const vk = createVkLive({
      token: 'test-token',
      fetchImpl: makeMockFetch(captured),
    });
    await vk.forwardMessages({
      fromChat: '100500',
      ids: ['1', '2'],
      toChat: '200600',
      randomId: 12345,
    });
    expect(captured.url).toContain('/method/messages.send');
    expect(captured.params.peer_id).toBe('200600');
    const fwd = JSON.parse(captured.params.forward);
    expect(fwd.peer_id).toBe('100500');
    expect(fwd.message_ids).toEqual([1, 2]);
    expect(fwd.is_reply).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// VK_REACTION_EMOJI_TO_ID
// ---------------------------------------------------------------------------

describe('VK_REACTION_EMOJI_TO_ID', () => {
  it('exports all 12 reaction emojis', () => {
    expect(Object.keys(VK_REACTION_EMOJI_TO_ID).length).toBe(12);
  });
});
