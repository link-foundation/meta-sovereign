// Every send and sync does what it says, or says it could not (R-Z4).
import { describe, it, expect } from 'test-anywhere';

import { syncProfile, syncResume, broadcast } from '../src/broadcast/index.js';
import { createAdapterSender } from '../src/crm/reengage.js';
import { createFallbackSender } from '../src/sources/browser-sender.js';
import { createHabrCareerLive } from '../src/sources/habr-career.js';
import { createHhLive } from '../src/sources/hh.js';
import { createLinkedInLive } from '../src/sources/linkedin.js';
import { createPeoplePerHourLive } from '../src/sources/peopleperhour.js';
import { createSuperjobLive } from '../src/sources/superjob.js';
import { createUpworkLive } from '../src/sources/upwork.js';
import { createXLive } from '../src/sources/x.js';

const reply = (body, status = 200) => ({
  ok: status < 400,
  status,
  statusText: status < 400 ? 'OK' : 'ERR',
  async text() {
    return JSON.stringify(body);
  },
});

const recorder = (answer = () => reply({ id: 'ok' })) => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const call = {
      url: new URL(String(url)),
      method: init.method ?? 'GET',
      body: init.body ? JSON.parse(init.body) : null,
    };
    calls.push(call);
    return answer(call);
  };
  fetchImpl.calls = calls;
  return fetchImpl;
};

const failure = async (run) => {
  try {
    await run();
  } catch (error) {
    return error;
  }
  return null;
};

describe('LinkedIn never turns a message into a public post', () => {
  const make = (fetchImpl) =>
    createLinkedInLive({
      fetchImpl,
      token: 't',
      author: 'urn:li:person:me',
      baseUrl: 'https://li.test',
    });

  it('refuses chat sends without any request', async () => {
    const fetchImpl = recorder();
    const live = make(fetchImpl);
    for (const run of [
      () => live.sendMessage({ chat: 'conv-1', text: 'hi' }),
      () => live.post({ chat: 'conv-1', text: 'hi' }),
      () => live.post({ to: 'someone', text: 'hi' }),
    ]) {
      expect((await failure(run)).code).toBe('unsupported');
    }
    expect(fetchImpl.calls.length).toBe(0);
  });

  it('the draft sender uses sendMessage, so a chat draft cannot publish', async () => {
    const fetchImpl = recorder();
    const live = make(fetchImpl);
    const send = createAdapterSender({
      getSource: () => ({ live }),
    });
    const error = await failure(() =>
      send({ source: 'linkedin', chat: 'c', contact: null, text: 'hello' })
    );
    expect(error.code).toBe('unsupported');
    expect(fetchImpl.calls.length).toBe(0);
  });

  it('publishes only through the explicit publishPost action', async () => {
    const fetchImpl = recorder();
    await make(fetchImpl).publishPost({ text: 'news' });
    expect(fetchImpl.calls.length).toBe(1);
    expect(fetchImpl.calls[0].body.visibility).toBe('PUBLIC');
  });

  it('profile and resume sync do not post unless asked to share as post', async () => {
    const fetchImpl = recorder();
    const live = make(fetchImpl);
    expect((await failure(() => live.syncResume({ title: 'A' }))).code).toBe(
      'unsupported'
    );
    expect((await failure(() => live.syncProfile({ name: 'A' }))).code).toBe(
      'unsupported'
    );
    expect(fetchImpl.calls.length).toBe(0);
    await live.syncResume({ title: 'A' }, { shareAsPost: true });
    expect(fetchImpl.calls.length).toBe(1);
  });
});

describe('X chat sends are DMs, posts are explicit', () => {
  const make = (fetchImpl) =>
    createXLive({
      fetchImpl,
      token: 't',
      userId: 'me',
      baseUrl: 'https://x.test',
    });

  it('replies to a conversation id with /dm_conversations/:id/messages', async () => {
    const fetchImpl = recorder();
    await make(fetchImpl).sendMessage({ chat: '111-222', text: 'hi' });
    expect(fetchImpl.calls[0].url.pathname).toBe(
      '/2/dm_conversations/111-222/messages'
    );
  });

  it('starts a DM with a user id only from a participant id', async () => {
    const fetchImpl = recorder();
    await make(fetchImpl).sendMessage({ to: '555', text: 'hi' });
    expect(fetchImpl.calls[0].url.pathname).toBe(
      '/2/dm_conversations/with/555/messages'
    );
  });

  it('never tweets for a chat send; a post thread is not a DM', async () => {
    const fetchImpl = recorder();
    const live = make(fetchImpl);
    for (const draft of [
      { chat: 'post:9', text: 'hi' },
      { chat: 'wall:self', text: 'hi' },
      { text: 'hi' },
    ]) {
      expect((await failure(() => live.sendMessage(draft))).code).toBe(
        'unsupported-chat'
      );
    }
    expect(fetchImpl.calls.length).toBe(0);
    await live.publishPost({ text: 'public' });
    expect(fetchImpl.calls[0].url.pathname).toBe('/2/tweets');
  });

  it('asks for dm_event fields and expansions', async () => {
    const fetchImpl = recorder(() => reply({ data: [] }));
    await make(fetchImpl).pullMessages({ mode: 'dms' });
    const search = fetchImpl.calls[0].url.searchParams;
    expect(search.get('dm_event.fields')).toMatch(/dm_conversation_id/);
    expect(search.get('expansions')).toMatch(/sender_id/);
  });

  it('a saved user id adds the mentions, it does not replace the DMs', async () => {
    const fetchImpl = recorder(() => reply({ data: [] }));
    await make(fetchImpl).pullMessages({});
    expect(fetchImpl.calls.map((c) => c.url.pathname)).toEqual([
      '/2/dm_events',
      '/2/users/me/mentions',
    ]);
  });

  it('keeps the DMs when the mentions pull fails, and says so', async () => {
    const fetchImpl = recorder((call) =>
      call.url.pathname.includes('mentions')
        ? reply({ title: 'Forbidden' }, 403)
        : reply({
            data: [
              {
                id: 'd1',
                event_type: 'MessageCreate',
                dm_conversation_id: '1-2',
                sender_id: '2',
                text: 'dm',
              },
            ],
          })
    );
    const pulled = await make(fetchImpl).pullMessages({});
    expect(pulled.links.length).toBe(1);
    expect(pulled.failures[0].stream).toBe('mentions');
  });

  it('does not attempt a bearer-token profile update', async () => {
    const fetchImpl = recorder();
    const error = await failure(() =>
      make(fetchImpl).syncProfile({ name: 'A' })
    );
    expect(error.code).toBe('unsupported');
    expect(fetchImpl.calls.length).toBe(0);
  });
});

describe('sync reports what it did not do', () => {
  it('resume sync is not ok for Upwork, PeoplePerHour and API job boards', async () => {
    const results = await syncResume(
      ['upwork', 'peopleperhour', 'hh', 'superjob', 'habr-career'],
      { title: 'Dev' }
    );
    for (const result of results) {
      expect(result.ok).toBe(false);
      expect(result.code).toBe('unsupported');
    }
  });

  it('profile sync is not ok where there is no profile update', async () => {
    const [upwork, linkedin] = await syncProfile(['upwork', 'linkedin'], {
      name: 'A',
    });
    expect(upwork.ok).toBe(false);
    expect(upwork.code).toBe('unsupported');
    expect(linkedin.ok).toBe(false);
    expect(linkedin.code).toBe('unsupported');
  });

  it('broadcast reports a failure as not ok with its code', async () => {
    const [result] = await broadcast(['nonexistent-network'], 'x').catch(() => [
      { ok: false },
    ]);
    expect(result.ok).toBe(false);
  });
});

describe('chat keys map to the id the API needs, or fail with a code', () => {
  it('Upwork sends to the room of a room: chat', async () => {
    const fetchImpl = recorder(() =>
      reply({ data: { roomsCreateMessage: { message: { id: 'm1' } } } })
    );
    const live = createUpworkLive({
      fetchImpl,
      token: 't',
      baseUrl: 'https://u.test',
    });
    await live.post({ chat: 'room:abc', text: 'hi' });
    expect(fetchImpl.calls[0].body.variables.roomId).toBe('abc');
    const error = await failure(() =>
      live.post({ chat: 'contract:7', text: 'hi' })
    );
    expect(error.code).toBe('unsupported-chat');
  });

  it('PeoplePerHour maps workstream: and proposal: chats', async () => {
    const fetchImpl = recorder(() => reply({ message: { id: 'm1' } }));
    const live = createPeoplePerHourLive({
      fetchImpl,
      token: 't',
      baseUrl: 'https://p.test',
    });
    await live.post({ chat: 'workstream:5', text: 'hi' });
    expect(fetchImpl.calls[0].url.pathname).toMatch(/workstreams\/5/);
    await live.post({ chat: 'proposal:6', text: 'hi' });
    expect(fetchImpl.calls[1].url.pathname).toMatch(/proposals\/6/);
    const error = await failure(() => live.post({ chat: 'job:1', text: 'hi' }));
    expect(error.code).toBe('unsupported-chat');
  });

  it('hh, Habr and SuperJob refuse a vacancy:<id> chat, not a wrong URL', async () => {
    for (const make of [
      createHhLive,
      createHabrCareerLive,
      createSuperjobLive,
    ]) {
      const fetchImpl = recorder();
      const live = make({ fetchImpl, token: 't', appId: 'a' });
      const error = await failure(() =>
        live.post({ chat: 'vacancy:123', text: 'hi' })
      );
      expect(error.code).toBe('unsupported-chat');
      expect(fetchImpl.calls.length).toBe(0);
    }
  });
});

describe('an ambiguous API failure never falls back to the browser', () => {
  const run = async (answer) => {
    const live = createHhLive({
      fetchImpl: recorder(answer),
      token: 't',
      baseUrl: 'https://hh.test',
    });
    let browserCalls = 0;
    const send = createFallbackSender({
      apiSend: (draft) => live.post({ chat: draft.chat, text: draft.text }),
      browserSend: async () => {
        browserCalls += 1;
        return { sent: true };
      },
    });
    const error = await send({ source: 'hh', chat: 'n1', text: 'hi' }).then(
      () => null,
      (caught) => caught
    );
    return { error, browserCalls };
  };

  it('does not fall back after a 5xx', async () => {
    const { error, browserCalls } = await run(() => reply({}, 502));
    expect(browserCalls).toBe(0);
    expect(error.ambiguous).toBe(true);
    expect(error.outcome).toBe('unknown');
  });

  it('does not fall back after a network failure or timeout', async () => {
    const { error, browserCalls } = await run(() => {
      throw new Error('socket hang up');
    });
    expect(browserCalls).toBe(0);
    expect(error.outcome).toBe('unknown');
  });

  it('falls back after a clear refusal (401)', async () => {
    const { error, browserCalls } = await run(() => reply({}, 401));
    expect(error).toBe(null);
    expect(browserCalls).toBe(1);
  });

  it('falls back when the adapter cannot do it at all', async () => {
    let browserCalls = 0;
    const send = createFallbackSender({
      apiSend: async () => {
        throw Object.assign(new Error('no'), { code: 'unsupported' });
      },
      browserSend: async () => {
        browserCalls += 1;
        return {};
      },
    });
    await send({ source: 'linkedin', chat: 'c', text: 'x' });
    expect(browserCalls).toBe(1);
  });
});
