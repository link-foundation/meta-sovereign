/**
 * Typing status and audience membership (issue #31, PR #34).
 *
 * Every request goes through an injected fetch that records the call
 * and replies from a queue, so no network or credentials are needed.
 */

import { describe, it, expect } from 'test-anywhere';

import {
  isTypingActive,
  memberLink,
  personLink,
  setTypingFor,
  syncMembership,
  typingLink,
} from '../src/sources/live-links.js';
import { getSource } from '../src/sources/index.js';
import { createVkLive, vkTypingFromUpdate } from '../src/sources/vk.js';
import { createTelegramBotLive } from '../src/sources/telegram.js';
import { createWhatsAppCloudLive } from '../src/sources/whatsapp.js';

// Records each request (path + decoded body) and answers from `replies`.
const recordingFetch = (replies) => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const raw = init.body;
    const body =
      raw instanceof URLSearchParams
        ? Object.fromEntries(raw.entries())
        : JSON.parse(raw ?? 'null');
    calls.push({ path: new URL(String(url)).pathname, body });
    const payload = replies.shift();
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => payload,
      text: async () => JSON.stringify(payload),
    };
  };
  fetchImpl.calls = calls;
  return fetchImpl;
};

// test-anywhere has no `.rejects`, so await the failure by hand.
const rejectsWith = async (promise, pattern) => {
  let error = null;
  try {
    await promise;
  } catch (caught) {
    error = caught;
  }
  expect(error?.message ?? 'did not reject').toMatch(pattern);
};

const vkLive = (replies) => {
  const fetchImpl = recordingFetch(replies);
  const live = createVkLive({
    token: 'vk-token',
    fetchImpl,
    baseUrl: 'https://vk.test',
  });
  return { live, calls: fetchImpl.calls };
};

const AT = '2026-10-11T12:00:00.000Z';

describe('live link shapes', () => {
  it('builds member, person and typing links with stable ids', () => {
    expect(
      memberLink({
        source: 'vk',
        group: 42,
        groupKind: 'community',
        groupName: 'Club',
        user: 7,
        name: 'Ann',
        at: AT,
      })
    ).toEqual({
      id: 'member:vk:42:7',
      tokens: ['member', 'vk', '42', '7'],
      kind: 'member',
      source: 'vk',
      group: '42',
      groupKind: 'community',
      groupName: 'Club',
      user: '7',
      name: 'Ann',
      at: AT,
    });
    expect(
      personLink({ source: 'vk', user: 7, handle: 'ann', at: AT })
    ).toEqual({
      id: 'person:vk:7',
      tokens: ['person', 'vk', '7'],
      kind: 'person',
      source: 'vk',
      user: '7',
      name: null,
      handle: 'ann',
      at: AT,
    });
    expect(
      typingLink({ source: 'telegram', chat: -100, user: 5, at: AT })
    ).toEqual({
      id: 'typing:telegram:-100:5',
      tokens: ['typing', 'telegram', '-100', '5'],
      kind: 'typing',
      source: 'telegram',
      chat: '-100',
      user: '5',
      state: 'typing',
      at: AT,
      until: '2026-10-11T12:00:06.000Z',
    });
  });

  it('expires typing state after its TTL and ignores idle links', () => {
    const link = typingLink({
      source: 'vk',
      chat: 1,
      user: 2,
      at: AT,
      ttlMs: 1000,
    });
    const start = Date.parse(AT);
    expect(isTypingActive(link, start + 500)).toBe(true);
    expect(isTypingActive(link, start + 1000)).toBe(false);
    expect(isTypingActive({ ...link, state: 'idle' }, start + 500)).toBe(false);
    expect(isTypingActive(null, start)).toBe(false);
  });
});

describe('VK typing and audiences', () => {
  it('sets typing activity through messages.setActivity', async () => {
    const { live, calls } = vkLive([{ response: 1 }]);
    expect(await live.setTyping({ chat: 2000000001 })).toBe(1);
    expect(calls[0].path).toBe('/method/messages.setActivity');
    expect(calls[0].body.peer_id).toBe('2000000001');
    expect(calls[0].body.type).toBe('typing');
    expect(calls[0].body.access_token).toBe('vk-token');
    await rejectsWith(live.setTyping({}), /peer_id/);
  });

  it('lists friends with name and handle fields', async () => {
    const { live, calls } = vkLive([
      {
        response: {
          count: 1,
          items: [{ id: 3, first_name: 'Ann', last_name: 'Lee', domain: 'al' }],
        },
      },
    ]);
    expect(await live.friends()).toEqual([
      { user: '3', name: 'Ann Lee', handle: 'al' },
    ]);
    expect(calls[0].path).toBe('/method/friends.get');
    expect(calls[0].body.fields).toContain('first_name,last_name,domain');
  });

  it('paginates groups.getMembers with count 1000 and offset', async () => {
    const page = (from, size) =>
      Array.from({ length: size }, (_, i) => ({ id: from + i }));
    const { live, calls } = vkLive([
      { response: { count: 1500, items: page(1, 1000) } },
      { response: { count: 1500, items: page(1001, 500) } },
    ]);
    const members = await live.communityMembers(99);
    expect(members.length).toBe(1500);
    expect(members[1499]).toEqual({ user: '1500', name: null, handle: null });
    expect(calls.map((c) => c.path)).toEqual([
      '/method/groups.getMembers',
      '/method/groups.getMembers',
    ]);
    expect(
      calls.map((c) => [c.body.group_id, c.body.count, c.body.offset])
    ).toEqual([
      ['99', '1000', '0'],
      ['99', '1000', '1000'],
    ]);
  });

  it('names chat members from profiles and groups', async () => {
    const { live, calls } = vkLive([
      {
        response: {
          items: [{ member_id: 3 }, { member_id: -9 }, { member_id: 4 }],
          profiles: [{ id: 3, first_name: 'Ann', screen_name: 'ann' }],
          groups: [{ id: 9, name: 'Bot Club', screen_name: 'club9' }],
        },
      },
    ]);
    expect(await live.chatMembers(2000000001)).toEqual([
      { user: '3', name: 'Ann', handle: 'ann' },
      { user: '-9', name: 'Bot Club', handle: 'club9' },
      { user: '4', name: null, handle: null },
    ]);
    expect(calls[0].path).toBe('/method/messages.getConversationMembers');
    expect(calls[0].body.peer_id).toBe('2000000001');
  });

  it('maps long-poll typing events to typing links', () => {
    const now = Date.parse(AT);
    const [bots] = vkTypingFromUpdate(
      {
        type: 'message_typing_state',
        object: { state: 'typing', from_id: 5, to_id: -9 },
      },
      { now }
    );
    expect(bots.id).toBe('typing:vk:5:5');
    expect(bots.at).toBe(AT);
    expect(isTypingActive(bots, now + 1)).toBe(true);
    const chat = vkTypingFromUpdate([63, 2000000001, [5, 6], 2, now / 1000]);
    expect(chat.map((l) => l.id)).toEqual([
      'typing:vk:2000000001:5',
      'typing:vk:2000000001:6',
    ]);
    expect(chat[0].at).toBe(AT);
    expect(vkTypingFromUpdate([62, 5, 1], { now })[0].chat).toBe('2000000001');
    expect(vkTypingFromUpdate([61, 5, 1], { now })[0].chat).toBe('5');
    expect(vkTypingFromUpdate([4, 1, 2], { now })).toEqual([]);
    expect(vkTypingFromUpdate({ type: 'message_new' })).toEqual([]);
  });
});

describe('Telegram and WhatsApp typing', () => {
  it('sends a typing chat action and lists chat admins with the count', async () => {
    const fetchImpl = recordingFetch([
      { ok: true, result: true },
      {
        ok: true,
        result: [{ user: { id: 1, first_name: 'Ada', username: 'ada' } }],
      },
      { ok: true, result: 25 },
    ]);
    const live = createTelegramBotLive({
      token: 'tg',
      fetchImpl,
      baseUrl: 'https://tg.test',
    });
    await live.setTyping({ chat: -100 });
    expect(await live.chatMembers(-100)).toEqual({
      members: [{ user: '1', name: 'Ada', handle: 'ada' }],
      count: 25,
      partial: true,
    });
    expect(fetchImpl.calls).toEqual([
      {
        path: '/bottg/sendChatAction',
        body: { chat_id: -100, action: 'typing' },
      },
      { path: '/bottg/getChatAdministrators', body: { chat_id: -100 } },
      { path: '/bottg/getChatMemberCount', body: { chat_id: -100 } },
    ]);
    await rejectsWith(live.friends(), /no friends/);
  });

  it('marks the incoming WhatsApp message read with a typing indicator', async () => {
    const fetchImpl = recordingFetch([{ success: true }]);
    const live = createWhatsAppCloudLive({
      token: 'wa',
      phoneNumberId: '555',
      fetchImpl,
      baseUrl: 'https://wa.test',
    });
    expect(
      await live.setTyping({ chat: '79990001122', messageId: 'wamid.in' })
    ).toEqual({ success: true });
    expect(fetchImpl.calls[0]).toEqual({
      path: '/555/messages',
      body: {
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: 'wamid.in',
        typing_indicator: { type: 'text' },
      },
    });
    await rejectsWith(live.setTyping({ chat: '7999' }), /messageId/);
  });
});

describe('syncMembership and setTypingFor', () => {
  it('puts member and person links for each requested group', async () => {
    const { live } = vkLive([
      { response: { count: 1, items: [{ id: 3, first_name: 'Ann' }] } },
      {
        response: {
          count: 2,
          items: [{ id: 3 }, { id: 4, first_name: 'Bo', domain: 'bo' }],
        },
      },
    ]);
    const stored = new Map();
    const summary = await syncMembership({
      source: 'vk',
      live,
      groups: [{ kind: 'friends' }, { kind: 'community', id: 9, name: 'Club' }],
      put: async (link) => stored.set(link.id, link),
      now: Date.parse(AT),
    });
    expect(summary).toEqual({
      groups: [
        { kind: 'friends', id: 'friends', count: 1, total: 1 },
        { kind: 'community', id: '9', count: 2, total: 2 },
      ],
      members: 3,
    });
    expect([...stored.keys()].sort()).toEqual([
      'member:vk:9:3',
      'member:vk:9:4',
      'member:vk:friends:3',
      'person:vk:3',
      'person:vk:4',
    ]);
    const member = stored.get('member:vk:9:4');
    expect([
      member.groupKind,
      member.groupName,
      member.name,
      member.at,
    ]).toEqual(['community', 'Club', 'Bo', AT]);
    expect(stored.get('person:vk:4').handle).toBe('bo');
  });

  it('keeps the Telegram total when only admins are listable', async () => {
    const live = {
      chatMembers: async () => ({
        members: [{ user: '1', name: 'Ada' }],
        count: 25,
      }),
    };
    const puts = [];
    const summary = await syncMembership({
      source: 'telegram',
      live,
      groups: [{ kind: 'chat', id: -100 }],
      put: async (link) => puts.push(link.id),
    });
    expect(summary.groups).toEqual([
      { kind: 'chat', id: '-100', count: 1, total: 25 },
    ]);
    expect(puts).toEqual(['member:telegram:-100:1', 'person:telegram:1']);
  });

  it('throws clearly when the adapter cannot list a group', async () => {
    const put = async () => {};
    await rejectsWith(
      syncMembership({ source: 'email', live: {}, put }),
      /email live API does not support friends/
    );
    await rejectsWith(
      syncMembership({ source: 'vk', live: {}, groups: [{ kind: 'x' }], put }),
      /cannot sync member group kind "x"/
    );
  });

  it('reports unsupported adapters and records automation typing', async () => {
    expect(
      await setTypingFor(getSource, { source: 'email', chat: 'a@b.c' })
    ).toEqual({ supported: false, source: 'email' });

    const seen = [];
    const fake = {
      live: {
        setTyping: async (target) => {
          seen.push(target);
          return 'ok';
        },
      },
    };
    const puts = [];
    const result = await setTypingFor(() => fake, {
      source: 'whatsapp',
      chat: '7999',
      messageId: 'wamid.in',
      put: async (link) => puts.push(link),
    });
    expect(result.supported).toBe(true);
    expect(result.result).toBe('ok');
    expect(seen).toEqual([{ chat: '7999', messageId: 'wamid.in' }]);
    expect(puts[0].id).toBe('typing:whatsapp:7999:me');
    expect(isTypingActive(puts[0])).toBe(true);
  });
});
