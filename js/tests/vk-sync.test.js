// R-Z8: VK stays current. Fetch (conversations with names, history paging),
// the official Long Poll for user and community tokens (`failed` 1/2/3, the
// `ts` cursor saved only after the store write), error 6 backoff, captcha,
// random_id. A fake VK answers; nothing touches the network.

import { describe, it, expect } from 'test-anywhere';

import { createMemoryStore } from '../src/storage/index.js';
import { aggregateContacts } from '../src/server/aggregate.js';
import { createVkInbox } from '../src/sources/vk-sync.js';
import { createVkLive } from '../src/sources/vk.js';
import { loadPullState } from '../src/sources/pull-runner.js';
import {
  createRateLimiter,
  vkRandomId,
  withTooManyBackoff,
} from '../src/sources/vk-limits.js';
import {
  createFakeVk,
  message,
  userMethods,
  FAKE_VK_BASE,
} from './helpers/fake-vk.js';

const saveToken = (store) =>
  store.put({
    id: 'secret:vk:access-token',
    tokens: ['secret', 'vk', 'access-token'],
    children: [],
    token: 'vk-secret-token',
  });

const idsOf = async (store) =>
  (await store.query())
    .filter((l) => l.id.startsWith('msg:vk:'))
    .map((l) => l.id)
    .sort();

const noSleep = async () => {};

const inboxOf = (store, fake, extra = {}) =>
  createVkInbox({
    store,
    fetchImpl: fake.fetchImpl,
    baseUrl: FAKE_VK_BASE,
    sleep: noSleep,
    requestsPerSecond: 1000,
    ...extra,
  });

// A store whose message writes fail, to prove the cursor stays put.
const failingMessages = (store) => ({
  ...store,
  put: async (link) => {
    if (String(link.id).startsWith('msg:')) {
      throw Object.assign(new Error('disk full'), { code: 'STORE_FULL' });
    }
    return store.put(link);
  },
  putMany: async (links) => {
    if (links.some((l) => String(l.id).startsWith('msg:'))) {
      throw Object.assign(new Error('disk full'), { code: 'STORE_FULL' });
    }
    return store.putMany(links);
  },
});

const conversationsAnswer = {
  count: 2,
  items: [
    {
      conversation: {
        peer: { id: 2000000001, type: 'chat' },
        chat_settings: { title: 'Team chat' },
      },
      last_message: message(10, 2000000001, 'hello team', { from_id: 7 }),
    },
    {
      conversation: { peer: { id: 7, type: 'user' } },
      last_message: message(11, 7, 'hi'),
    },
  ],
  profiles: [{ id: 7, first_name: 'Ann', last_name: 'Lee' }],
  groups: [],
};

describe('VK fetch: conversations with names and history paging (R-Z8)', () => {
  it('asks for extended names and stores sender and chat names', async () => {
    const store = createMemoryStore();
    await saveToken(store);
    const fake = createFakeVk({
      methods: userMethods({
        'messages.getConversations': () => conversationsAnswer,
        'messages.getHistory': () => ({ count: 0, items: [] }),
        'messages.getById': () => ({ items: [] }),
      }),
      poll: () => ({ ts: '101', updates: [] }),
    });
    const inbox = inboxOf(store, fake);
    const result = await inbox.fetch();
    expect(result.imported).toBe(2);
    const getConv = fake.calls.find(
      (c) => c.name === 'messages.getConversations'
    );
    expect(getConv.params.extended).toBe('1');
    const links = await store.query();
    const chat = links.find((l) => l.id === 'msg:vk:10');
    expect(chat.chatName).toBe('Team chat');
    expect(chat.senderName).toBe('Ann Lee');
    expect(links.find((l) => l.id === 'msg:vk:11').chatName).toBe('Ann Lee');
  });

  it('pages a chat back by offset and saves the offset after the write', async () => {
    const store = createMemoryStore();
    await saveToken(store);
    const history = (params) => {
      const offset = Number(params.offset ?? 0);
      const all = Array.from({ length: 5 }, (_, i) =>
        message(100 - i, 7, `old ${i}`)
      );
      return { count: 5, items: all.slice(offset, offset + 2) };
    };
    const fake = createFakeVk({
      methods: userMethods({
        'messages.getConversations': () => ({
          ...conversationsAnswer,
          items: [conversationsAnswer.items[1]],
        }),
        'messages.getHistory': history,
      }),
      poll: () => ({ ts: '101', updates: [] }),
    });
    const inbox = inboxOf(store, fake);
    await inbox.fetch();
    const state = await loadPullState(store, 'vk');
    // Two pages of two messages were read; the chat is not finished yet.
    expect(state.backfill['7']).toBe(4);
    await inbox.fetch();
    const after = await loadPullState(store, 'vk');
    expect(after.backfill['7']).toBe('done');
    expect((await idsOf(store)).length).toBe(6);
  });

  it('keeps the history offset when the store write fails', async () => {
    const store = createMemoryStore();
    await saveToken(store);
    const fake = createFakeVk({
      methods: userMethods({
        'messages.getConversations': () => ({
          ...conversationsAnswer,
          items: [conversationsAnswer.items[1]],
        }),
        'messages.getHistory': () => ({
          count: 9,
          items: [message(5, 7, 'x')],
        }),
      }),
    });
    const inbox = inboxOf(failingMessages(store), fake);
    const error = await inbox.fetch().catch((e) => e);
    expect(error.message).toBe('disk full');
    const state = await loadPullState(store, 'vk');
    expect(state.backfill).toBe(undefined);
  });
});

describe('VK Long Poll, user token (R-Z8)', () => {
  const setup = (pollAnswers, extraMethods = {}) => {
    const store = createMemoryStore();
    const answers = [...pollAnswers];
    const fake = createFakeVk({
      methods: userMethods({
        'messages.getById': (params) => ({
          items: params.message_ids
            .split(',')
            .map((id) => message(Number(id), 7, `new ${id}`)),
          profiles: [{ id: 7, first_name: 'Ann', last_name: 'Lee' }],
        }),
        'messages.getConversations': () => conversationsAnswer,
        'messages.getHistory': () => ({ count: 0, items: [] }),
        ...extraMethods,
      }),
      poll: () => answers.shift() ?? { ts: '999', updates: [] },
    });
    return { store, fake, inbox: inboxOf(store, fake) };
  };

  it('stores a new message with names and saves ts only afterwards', async () => {
    const { store, fake, inbox } = setup([
      { ts: '105', updates: [[4, 77, 1, 7, 1700000000, 'x', {}]] },
    ]);
    await saveToken(store);
    const result = await inbox.step({ wait: 0 });
    expect(result.imported).toBe(1);
    const link = (await store.query()).find((l) => l.id === 'msg:vk:77');
    expect(link.senderName).toBe('Ann Lee');
    expect(link.body).toBe('new 77');
    expect((await loadPullState(store, 'vk')).ts).toBe('105');
    // The request asked with the key, the first ts, and the attachments mode.
    expect(fake.polls[0]).toEqual({
      act: 'a_check',
      key: 'k1',
      ts: '100',
      wait: '0',
      mode: '2',
      version: '3',
    });
  });

  it('does not move ts when the batch could not be stored, and reads it again', async () => {
    const { store, fake } = setup([
      { ts: '105', updates: [[4, 77, 1, 7, 1700000000, 'x', {}]] },
      { ts: '105', updates: [[4, 77, 1, 7, 1700000000, 'x', {}]] },
    ]);
    await saveToken(store);
    const broken = inboxOf(failingMessages(store), fake);
    const error = await broken.step({ wait: 0 }).catch((e) => e);
    expect(error.message).toBe('disk full');
    expect((await loadPullState(store, 'vk')).ts).toBe(undefined);
    const healthy = inboxOf(store, fake);
    await healthy.step({ wait: 0 });
    expect(await idsOf(store)).toEqual(['msg:vk:77']);
    expect((await loadPullState(store, 'vk')).ts).toBe('105');
  });

  it('resumes from the saved ts after a restart', async () => {
    const { store, fake, inbox } = setup([{ ts: '201', updates: [] }]);
    await saveToken(store);
    await store.put({
      id: 'pull-state:vk',
      tokens: ['pull', 'state', 'vk'],
      children: [],
      mode: 'user',
      ts: '150',
    });
    await inbox.step({ wait: 0 });
    expect(fake.polls[0].ts).toBe('150');
  });

  it('failed=1 takes the ts VK gives and reads the conversations once', async () => {
    const { store, fake, inbox } = setup([{ failed: 1, ts: '500' }]);
    await saveToken(store);
    await inbox.step({ wait: 0 });
    expect(
      fake.calls.filter((c) => c.name === 'messages.getConversations').length
    ).toBe(1);
    expect((await loadPullState(store, 'vk')).ts).toBe('500');
    expect((await idsOf(store)).length).toBe(2);
  });

  it('failed=2 asks for a new key and keeps ts', async () => {
    let servers = 0;
    const { store, fake, inbox } = setup(
      [{ failed: 2 }, { ts: '120', updates: [] }],
      {
        'messages.getLongPollServer': () => {
          servers += 1;
          return { key: `k${servers}`, server: 'lp.vk.fake/im1', ts: 100 };
        },
      }
    );
    await saveToken(store);
    await inbox.step({ wait: 0 });
    await inbox.step({ wait: 0 });
    expect(servers).toBe(2);
    expect(fake.polls[1].key).toBe('k2');
    expect(fake.polls[1].ts).toBe('100');
    expect(fake.calls.some((c) => c.name === 'messages.getConversations')).toBe(
      false
    );
  });

  it('failed=3 asks for key and ts again and catches up', async () => {
    let servers = 0;
    const { store, fake, inbox } = setup(
      [{ failed: 3 }, { ts: '310', updates: [] }],
      {
        'messages.getLongPollServer': () => {
          servers += 1;
          return { key: `k${servers}`, server: 'lp.vk.fake/im1', ts: 300 };
        },
      }
    );
    await saveToken(store);
    await inbox.step({ wait: 0 });
    await inbox.step({ wait: 0 });
    expect(fake.polls[1].key).toBe('k2');
    expect(fake.polls[1].ts).toBe('300');
    expect(fake.calls.some((c) => c.name === 'messages.getConversations')).toBe(
      true
    );
    expect((await loadPullState(store, 'vk')).ts).toBe('310');
  });

  it('turns typing events into typing links', async () => {
    const { store, inbox } = setup([{ ts: '9', updates: [[61, 7, 1]] }]);
    await saveToken(store);
    await inbox.step({ wait: 0 });
    const typing = (await store.query()).filter((l) => l.kind === 'typing');
    expect(typing.map((l) => l.chat)).toEqual(['7']);
  });
});

describe('VK Long Poll loop (R-Z8)', () => {
  it('runs in the background, stores events, backs off on errors, and stops', async () => {
    const store = createMemoryStore();
    await saveToken(store);
    let n = 0;
    const fake = createFakeVk({
      methods: userMethods({
        'messages.getById': () => ({
          items: [message(61, 7, 'live')],
          profiles: [{ id: 7, first_name: 'Ann', last_name: 'Lee' }],
        }),
      }),
      poll: () => {
        n += 1;
        if (n === 1) {
          // A broken answer: the loop backs off instead of crashing.
          throw new Error('connection reset');
        }
        // Then one event, then a poll that waits for ever.
        return n === 2
          ? { ts: '7', updates: [[4, 61, 1, 7, 1700000000, 'x', {}]] }
          : new Promise(() => {});
      },
    });
    const sleeps = [];
    const inbox = inboxOf(store, fake, {
      startDelayMs: 0,
      sleep: async (ms) => {
        sleeps.push(ms);
        await new Promise((r) => setTimeout(r, 1));
      },
    });
    inbox.start();
    for (let i = 0; i < 200 && (await idsOf(store)).length === 0; i += 1) {
      await new Promise((r) => setTimeout(r, 5));
    }
    expect(await idsOf(store)).toEqual(['msg:vk:61']);
    expect(sleeps.includes(5000)).toBe(true);
    expect(inbox.running).toBe(true);
    inbox.stop();
    expect(inbox.running).toBe(false);
  });
});

describe('VK Long Poll stop', () => {
  it('resolves only once the batch in flight is stored', async () => {
    const store = createMemoryStore();
    await saveToken(store);
    let release;
    const gate = new Promise((r) => {
      release = r;
    });
    let asked;
    const reading = new Promise((r) => {
      asked = r;
    });
    const fake = createFakeVk({
      methods: userMethods({
        'messages.getById': async () => {
          asked();
          await gate;
          return {
            items: [message(62, 7, 'late')],
            profiles: [{ id: 7, first_name: 'Ann', last_name: 'Lee' }],
          };
        },
      }),
      poll: () => ({ ts: '8', updates: [[4, 62, 1, 7, 1700000000, 'x', {}]] }),
    });
    const inbox = inboxOf(store, fake, { startDelayMs: 0 });
    inbox.start();
    await reading;
    let stopped = false;
    const stopping = inbox.stop().then(() => {
      stopped = true;
    });
    await new Promise((r) => setTimeout(r, 10));
    expect(stopped).toBe(false);
    release();
    await stopping;
    expect(await idsOf(store)).toEqual(['msg:vk:62']);
    expect((await loadPullState(store, 'vk')).ts).toBe('8');
  });
});

describe('VK Bots Long Poll, community token (R-Z8)', () => {
  it('uses groups.getLongPollServer and stores message_new', async () => {
    const store = createMemoryStore();
    await saveToken(store);
    const fake = createFakeVk({
      methods: {
        'users.get': () => [],
        'groups.getById': () => ({ groups: [{ id: 555, name: 'Shop' }] }),
        'groups.getLongPollServer': () => ({
          key: 'gk',
          server: 'https://lp.vk.fake/im1',
          ts: '40',
        }),
      },
      poll: () => ({
        ts: '41',
        updates: [
          {
            type: 'message_new',
            object: { message: message(900, 7, 'order?') },
            group_id: 555,
          },
        ],
      }),
    });
    const inbox = inboxOf(store, fake);
    await inbox.step({ wait: 0 });
    expect(fake.polls[0]).toEqual({
      act: 'a_check',
      key: 'gk',
      ts: '40',
      wait: '0',
    });
    expect(await idsOf(store)).toEqual(['msg:vk:900']);
    const state = await loadPullState(store, 'vk');
    expect(state.mode).toBe('community');
    expect(state.groupId).toBe(555);
    expect(state.ts).toBe('41');
  });
});

describe('contacts from messages with unix-second times (R-Z8)', () => {
  it('sorts VK and Upwork contacts without throwing', () => {
    const link = (id, sender, timestamp) => ({
      id: `msg:vk:${id}`,
      source: 'vk',
      chat: sender,
      sender,
      timestamp,
    });
    const contacts = aggregateContacts([
      link(1, '7', 1700000000),
      link(2, '8', 1700000500),
      link(3, '9', '2023-11-14T22:30:00Z'),
    ]);
    expect(contacts.map((c) => c.id)).toEqual(['9', '8', '7']);
    expect(typeof contacts[0].lastSeen).toBe('string');
  });
});

describe('VK limits (R-Z8)', () => {
  it('holds a user token to 3 requests a second', async () => {
    let clock = 0;
    const waits = [];
    const limiter = createRateLimiter({
      perSecond: 3,
      now: () => clock,
      sleep: async (ms) => {
        waits.push(ms);
        clock += ms;
      },
    });
    for (let i = 0; i < 4; i += 1) {
      await limiter.wait();
    }
    expect(waits.length).toBe(1);
    expect(waits[0]).toBe(1000);
  });

  it('error 6 backs off and succeeds, never crashes', async () => {
    let tries = 0;
    const fake = createFakeVk({
      methods: {
        'users.get': () => {
          tries += 1;
          return tries < 3
            ? {
                error: {
                  error_code: 6,
                  error_msg: 'Too many requests per second',
                },
              }
            : [{ id: 1 }];
        },
      },
    });
    const sleeps = [];
    const live = createVkLive({
      token: 't',
      fetchImpl: fake.fetchImpl,
      baseUrl: FAKE_VK_BASE,
      sleep: async (ms) => sleeps.push(ms),
    });
    const out = await live.call('users.get');
    expect(out[0].id).toBe(1);
    expect(sleeps).toEqual([400, 800]);
  });

  it('error 6 that never ends is a rate-limited error, not an exception storm', async () => {
    const fake = createFakeVk({
      methods: {
        'users.get': () => ({ error: { error_code: 6, error_msg: 'x' } }),
      },
    });
    const live = createVkLive({
      token: 't',
      fetchImpl: fake.fetchImpl,
      baseUrl: FAKE_VK_BASE,
      sleep: noSleep,
    });
    const error = await live.call('users.get').catch((e) => e);
    expect(error.code).toBe('rate-limited');
    expect(fake.calls.length).toBe(4);
  });

  it('does not repeat other errors', async () => {
    let n = 0;
    const error = await withTooManyBackoff(async () => {
      n += 1;
      throw Object.assign(new Error('x'), { vkCode: 5 });
    }).catch((e) => e);
    expect(error.message).toBe('x');
    expect(n).toBe(1);
  });
});

describe('VK send safety (R-Z8)', () => {
  it('captcha (error 14) is a clear code, sent once, no fallback, no retry', async () => {
    const fake = createFakeVk({
      methods: {
        'messages.send': () => ({
          error: {
            error_code: 14,
            error_msg: 'Captcha needed',
            captcha_sid: '123',
            captcha_img: 'https://api.vk.com/captcha.php?sid=123',
          },
        }),
      },
    });
    const live = createVkLive({
      token: 't',
      fetchImpl: fake.fetchImpl,
      baseUrl: FAKE_VK_BASE,
      sleep: noSleep,
    });
    const error = await live
      .post({ chat: 7, text: 'hi', clientId: 'c1' })
      .catch((e) => e);
    expect(error.code).toBe('captcha');
    expect(error.fallback).toBe(false);
    expect(error.captchaSid).toBe('123');
    expect(fake.calls.length).toBe(1);
  });

  it('random_id comes from the clientId: the same on a retry, 31-bit, never 0', async () => {
    const fake = createFakeVk({ methods: { 'messages.send': () => 1 } });
    const live = createVkLive({
      token: 't',
      fetchImpl: fake.fetchImpl,
      baseUrl: FAKE_VK_BASE,
    });
    await live.post({ chat: 7, text: 'hi', clientId: 'draft-1' });
    await live.post({ chat: 7, text: 'hi', clientId: 'draft-1' });
    await live.post({ chat: 7, text: 'hi', clientId: 'draft-2' });
    const [a, b, c] = fake.calls.map((x) => Number(x.params.random_id));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    for (const id of [a, c]) {
      expect(id > 0 && id <= 0x7fffffff).toBe(true);
    }
    expect(vkRandomId('draft-1')).toBe(a);
  });
});
