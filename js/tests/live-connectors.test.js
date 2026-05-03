import { describe, it, expect } from 'test-anywhere';

import { createFacebookLive } from '../src/sources/facebook.js';
import { createHabrCareerLive } from '../src/sources/habr-career.js';
import { createHhLive } from '../src/sources/hh.js';
import { createLinkedInLive } from '../src/sources/linkedin.js';
import { createSuperjobLive } from '../src/sources/superjob.js';
import { createVkLive } from '../src/sources/vk.js';
import { createWhatsAppCloudLive } from '../src/sources/whatsapp.js';
import { createXLive } from '../src/sources/x.js';
import { createEmailLive } from '../src/sources/email.js';

const json = (body, init = {}) => ({
  ok: (init.status ?? 200) < 400,
  status: init.status ?? 200,
  statusText: init.statusText ?? 'OK',
  headers: new Map([
    ['Content-Type', 'application/json'],
    ...Object.entries(init.headers ?? {}),
  ]),
  async text() {
    return JSON.stringify(body);
  },
});

const bodyObject = (body) => {
  if (!body) {
    return null;
  }
  if (body instanceof URLSearchParams) {
    return Object.fromEntries(body.entries());
  }
  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch {
      return Object.fromEntries(new URLSearchParams(body).entries());
    }
  }
  return body;
};

const mockFetch = (...handlers) => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const call = {
      url: new URL(String(url)),
      init,
      body: bodyObject(init.body),
    };
    calls.push(call);
    const handler = handlers.shift();
    if (!handler) {
      throw new Error(`unexpected fetch ${call.url.pathname}`);
    }
    return json(await handler(call));
  };
  fetchImpl.calls = calls;
  return fetchImpl;
};

describe('VK live adapter', () => {
  it('pulls conversation messages and sends replies through VK methods', async () => {
    const fetchImpl = mockFetch(
      (call) => {
        expect(call.url.pathname).toBe('/method/messages.getConversations');
        expect(call.body.access_token).toBe('vk-token');
        return {
          response: {
            items: [
              {
                conversation: { peer: { id: 200 } },
                last_message: {
                  id: 1,
                  from_id: 2,
                  peer_id: 200,
                  text: 'hello from vk',
                  date: 123,
                },
              },
            ],
          },
        };
      },
      (call) => {
        expect(call.url.pathname).toBe('/method/messages.send');
        expect(call.body.peer_id).toBe('200');
        expect(call.body.message).toBe('reply');
        return { response: 99 };
      }
    );
    const live = createVkLive({ fetchImpl, baseUrl: 'https://vk.test' });
    const pulled = await live.pullMessages({ token: 'vk-token' });
    expect(pulled.links[0].id).toBe('msg:vk:1');
    expect(pulled.links[0].body).toBe('hello from vk');
    const sent = await live.post(
      { chat: 200, text: 'reply' },
      { token: 'vk-token' }
    );
    expect(sent).toBe(99);
  });
});

describe('WhatsApp Cloud live adapter', () => {
  it('normalizes webhook messages and posts Cloud API text messages', async () => {
    const fetchImpl = mockFetch((call) => {
      expect(call.url.pathname).toBe('/v22.0/phone-1/messages');
      expect(call.init.headers.Authorization).toBe('Bearer wa-token');
      expect(call.body.to).toBe('15550001');
      expect(call.body.text.body).toBe('pong');
      return { messages: [{ id: 'wamid.out' }] };
    });
    const live = createWhatsAppCloudLive({
      fetchImpl,
      baseUrl: 'https://graph.test/v22.0',
      phoneNumberId: 'phone-1',
    });
    const pulled = await live.pullMessages({
      webhookPayload: {
        entry: [
          {
            changes: [
              {
                value: {
                  messages: [
                    {
                      id: 'wamid.in',
                      from: '15550001',
                      timestamp: '1',
                      text: { body: 'ping' },
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
    });
    expect(pulled.links[0].id).toBe('msg:whatsapp:wamid.in');
    expect(pulled.links[0].body).toBe('ping');
    await live.post({ to: '15550001', text: 'pong' }, { token: 'wa-token' });
  });
});

describe('X live adapter', () => {
  it('pulls DM events and can publish a post', async () => {
    const fetchImpl = mockFetch(
      (call) => {
        expect(call.url.pathname).toBe('/2/dm_events');
        expect(call.url.searchParams.get('max_results')).toBe('10');
        return {
          data: [
            {
              id: 'dm1',
              event_type: 'MessageCreate',
              dm_conversation_id: 'c1',
              sender_id: 'u1',
              text: 'x dm',
              created_at: 'now',
            },
          ],
          meta: { next_token: 'next' },
        };
      },
      (call) => {
        expect(call.url.pathname).toBe('/2/tweets');
        expect(call.init.headers.Authorization).toBe('Bearer x-token');
        expect(call.body.text).toBe('public update');
        return { data: { id: 'tweet1' } };
      }
    );
    const live = createXLive({ fetchImpl, baseUrl: 'https://x.test' });
    const pulled = await live.pullMessages({ token: 'x-token', limit: 10 });
    expect(pulled.links[0].id).toBe('msg:x:dm1');
    expect(pulled.nextOffset).toBe('next');
    await live.post('public update', { token: 'x-token' });
  });
});

describe('Facebook live adapter', () => {
  it('pulls page conversations and sends Messenger replies', async () => {
    const fetchImpl = mockFetch(
      (call) => {
        expect(call.url.pathname).toBe('/v22.0/page-1/conversations');
        return {
          data: [
            {
              id: 'thread1',
              messages: {
                data: [
                  {
                    id: 'fb1',
                    from: { id: 'sender1' },
                    message: 'facebook hello',
                    created_time: 'now',
                  },
                ],
              },
            },
          ],
        };
      },
      (call) => {
        expect(call.url.pathname).toBe('/v22.0/page-1/messages');
        expect(call.body.recipient.id).toBe('sender1');
        expect(call.body.message.text).toBe('facebook reply');
        return { message_id: 'out1' };
      }
    );
    const live = createFacebookLive({
      fetchImpl,
      baseUrl: 'https://graph.test/v22.0',
      pageId: 'page-1',
    });
    const pulled = await live.pullMessages({ token: 'fb-token' });
    expect(pulled.links[0].id).toBe('msg:facebook:fb1');
    await live.post(
      { to: 'sender1', text: 'facebook reply' },
      { token: 'fb-token' }
    );
  });
});

describe('LinkedIn live adapter', () => {
  it('imports author posts and exports resume updates as posts', async () => {
    const fetchImpl = mockFetch(
      (call) => {
        expect(call.url.pathname).toBe('/rest/posts');
        expect(call.url.searchParams.get('q')).toBe('author');
        return {
          elements: [
            {
              id: 'urn:li:share:1',
              author: 'urn:li:person:me',
              commentary: 'linkedin post',
              createdAt: 10,
            },
          ],
        };
      },
      (call) => {
        expect(call.url.pathname).toBe('/rest/posts');
        expect(call.init.method).toBe('POST');
        expect(call.body.author).toBe('urn:li:person:me');
        expect(call.body.commentary).toMatch(/Engineer/);
        return { id: 'urn:li:share:2' };
      }
    );
    const live = createLinkedInLive({
      fetchImpl,
      baseUrl: 'https://linkedin.test',
      author: 'urn:li:person:me',
    });
    const pulled = await live.pullMessages({ token: 'li-token' });
    expect(pulled.links[0].id).toBe('msg:linkedin:urn:li:share:1');
    await live.syncResume(
      { title: 'Engineer', skills: ['javascript'] },
      { token: 'li-token' }
    );
  });
});

describe('job-board live adapters', () => {
  it('syncs hh, Habr Career, and SuperJob messages/resumes', async () => {
    const hhFetch = mockFetch(
      () => ({
        items: [
          {
            id: 'neg1',
            vacancy: { id: 'v1' },
            messages: [{ id: 'm1', author: { id: 'hr' }, text: 'hh hello' }],
          },
        ],
        page: 0,
        pages: 1,
      }),
      (call) => {
        expect(call.url.pathname).toBe('/resumes/resume1');
        expect(call.init.method).toBe('PUT');
        return { id: 'resume1' };
      }
    );
    const hh = createHhLive({ fetchImpl: hhFetch, baseUrl: 'https://hh.test' });
    expect((await hh.pullMessages({ token: 'hh-token' })).links[0].body).toBe(
      'hh hello'
    );
    await hh.syncResume(
      { id: 'resume1', title: 'Engineer' },
      { token: 'hh-token' }
    );

    const habrFetch = mockFetch(
      () => ({
        items: [
          { id: 'app1', vacancyId: 'v2', from: 'hr', message: 'habr hi' },
        ],
      }),
      (call) => {
        expect(call.url.pathname).toBe('/api/resume');
        expect(call.init.method).toBe('POST');
        return { id: 'resume2' };
      }
    );
    const habr = createHabrCareerLive({
      fetchImpl: habrFetch,
      baseUrl: 'https://habr.test',
    });
    expect(
      (await habr.pullMessages({ token: 'habr-token' })).links[0].body
    ).toBe('habr hi');
    await habr.syncResume({ title: 'Engineer' }, { token: 'habr-token' });

    const superjobFetch = mockFetch(
      () => ({
        objects: [{ id: 'r1', vacancy_id: 'v3', from: 'hr', message: 'sj hi' }],
      }),
      (call) => {
        expect(call.url.pathname).toBe('/2.0/user_cvs/44/');
        expect(call.init.method).toBe('PUT');
        return { id: 44 };
      }
    );
    const superjob = createSuperjobLive({
      fetchImpl: superjobFetch,
      baseUrl: 'https://superjob.test/2.0',
      appId: 'app',
    });
    expect(
      (await superjob.pullMessages({ token: 'sj-token', appId: 'app' }))
        .links[0].body
    ).toBe('sj hi');
    await superjob.syncResume(
      { id: 44, title: 'Engineer' },
      { token: 'sj-token', appId: 'app' }
    );
  });
});

describe('Gmail email live adapter', () => {
  it('pulls and sends Gmail messages through the Gmail HTTP API', async () => {
    const fetchImpl = mockFetch(
      (call) => {
        expect(call.url.pathname).toBe('/gmail/v1/users/me/messages');
        expect(call.url.searchParams.get('maxResults')).toBe('2');
        expect(call.init.headers.Authorization).toBe('Bearer gmail-token');
        return { messages: [{ id: 'gm1' }], nextPageToken: 'next' };
      },
      (call) => {
        expect(call.url.pathname).toBe('/gmail/v1/users/me/messages/gm1');
        expect(call.url.searchParams.get('format')).toBe('full');
        return {
          id: 'gm1',
          threadId: 'thread1',
          internalDate: '1777802400000',
          payload: {
            headers: [
              { name: 'From', value: 'Alice <alice@example.com>' },
              { name: 'To', value: 'Bob <bob@example.com>' },
              { name: 'Subject', value: 'Gmail hello' },
            ],
            body: { data: 'SGVsbG8gZnJvbSBHbWFpbA' },
          },
          snippet: 'Hello from Gmail',
        };
      },
      (call) => {
        expect(call.url.pathname).toBe('/gmail/v1/users/me/messages/send');
        expect(call.init.method).toBe('POST');
        expect(typeof call.body.raw).toBe('string');
        return { id: 'sent-gm1' };
      }
    );
    const live = createEmailLive({
      protocol: 'gmail',
      fetchImpl,
      baseUrl: 'https://gmail.test',
    });
    const pulled = await live.pullMessages({ token: 'gmail-token', limit: 2 });
    expect(pulled.links[0].id).toBe('msg:email:gm1');
    expect(pulled.links[0].provider).toBe('gmail');
    expect(pulled.links[0].body).toBe('Hello from Gmail');
    expect(pulled.nextOffset).toBe('next');
    await live.post(
      {
        from: 'alice@example.com',
        to: 'bob@example.com',
        subject: 'Reply',
        text: 'Hi',
      },
      { token: 'gmail-token' }
    );
  });
});

describe('Microsoft Graph email live adapter', () => {
  it('pulls and sends Outlook mail through Microsoft Graph', async () => {
    const fetchImpl = mockFetch(
      (call) => {
        expect(call.url.pathname).toBe('/v1.0/me/messages');
        expect(call.url.searchParams.get('$top')).toBe('1');
        expect(call.init.headers.Authorization).toBe('Bearer graph-token');
        expect(call.init.headers.Prefer).toBe(
          'outlook.body-content-type="text"'
        );
        return {
          value: [
            {
              id: 'ms1',
              conversationId: 'conv1',
              subject: 'Graph hello',
              receivedDateTime: '2026-05-03T10:00:00Z',
              sender: {
                emailAddress: {
                  name: 'Alice',
                  address: 'alice@example.com',
                },
              },
              toRecipients: [{ emailAddress: { address: 'bob@example.com' } }],
              body: { content: 'Hello from Graph' },
            },
          ],
          '@odata.nextLink': 'https://graph.test/v1.0/me/messages?$skip=1',
        };
      },
      (call) => {
        expect(call.url.pathname).toBe('/v1.0/me/sendMail');
        expect(call.init.method).toBe('POST');
        expect(call.body.message.subject).toBe('Reply');
        expect(call.body.message.toRecipients[0].emailAddress.address).toBe(
          'bob@example.com'
        );
        return {};
      }
    );
    const live = createEmailLive({
      protocol: 'microsoft-graph',
      fetchImpl,
      baseUrl: 'https://graph.test/v1.0',
    });
    const pulled = await live.pullMessages({ token: 'graph-token', limit: 1 });
    expect(pulled.links[0].id).toBe('msg:email:ms1');
    expect(pulled.links[0].chat).toBe('conv1');
    expect(pulled.links[0].body).toBe('Hello from Graph');
    expect(pulled.nextOffset).toMatch(/skip=1/);
    await live.post(
      { to: 'bob@example.com', subject: 'Reply', text: 'Hi' },
      { token: 'graph-token' }
    );
  });
});

describe('JMAP email live adapter', () => {
  it('uses JMAP Email/query, Email/get, and EmailSubmission/set', async () => {
    const fetchImpl = mockFetch(
      (call) => {
        expect(call.url.pathname).toBe('/jmap');
        expect(call.body.methodCalls[0][0]).toBe('Email/query');
        return {
          methodResponses: [
            ['Email/query', { ids: ['j1'] }, 'q'],
            [
              'Email/get',
              {
                list: [
                  {
                    id: 'j1',
                    threadId: 'jt1',
                    from: [{ email: 'alice@example.com', name: 'Alice' }],
                    to: [{ email: 'bob@example.com' }],
                    subject: 'JMAP hello',
                    receivedAt: '2026-05-03T10:00:00Z',
                    preview: 'Hello from JMAP',
                  },
                ],
              },
              'g',
            ],
          ],
        };
      },
      (call) => {
        expect(call.url.pathname).toBe('/jmap');
        expect(call.body.methodCalls[0][0]).toBe('Email/set');
        expect(call.body.methodCalls[1][0]).toBe('EmailSubmission/set');
        return {
          methodResponses: [['EmailSubmission/set', { created: {} }, 's']],
        };
      }
    );
    const live = createEmailLive({
      protocol: 'jmap',
      fetchImpl,
      baseUrl: 'https://mail.test/jmap',
      accountId: 'account-1',
    });
    const pulled = await live.pullMessages({ token: 'jmap-token', limit: 5 });
    expect(pulled.links[0].id).toBe('msg:email:j1');
    expect(pulled.links[0].provider).toBe('jmap');
    await live.post(
      { to: 'bob@example.com', subject: 'Reply', text: 'Hi' },
      { token: 'jmap-token' }
    );
  });
});
