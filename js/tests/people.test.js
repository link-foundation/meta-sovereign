// Issue #31 / PR #34: a searchable, cross-referenced people directory
// and audiences merged from friends, chats, communities and lists (with
// intersect / union / difference) that automation can be triggered for.

import assert from 'node:assert/strict';
import { describe, it, expect } from 'test-anywhere';

import {
  audienceLink,
  buildPeople,
  crossReference,
  formatAudienceSpec,
  listLink,
  parseAudienceSpec,
  peopleIndex,
  resolveAudience,
  searchPeople,
} from '../src/crm/people.js';
import { buildMessageLink } from '../src/sources/link.js';
import { memberLink, personLink } from '../src/sources/live-links.js';

// test-anywhere's toThrow does not check the error, so assert does.
const expectError = (fn) => ({
  toThrow: (expected) =>
    assert.throws(
      fn,
      typeof expected === 'string' ? { message: expected } : expected
    ),
});

let seq = 0;
const msg = (source, chat, sender, day, extra = {}) =>
  buildMessageLink({
    source,
    externalId: String((seq += 1)),
    sender,
    chat,
    body: `message ${seq}`,
    timestamp: `2026-09-${String(day).padStart(2, '0')}T12:00:00.000Z`,
    ...extra,
  });

const member = (group, groupKind, user, name = null) =>
  memberLink({ source: 'vk', group, groupKind, user, name, at: 0 });

const links = [
  // vk: a mutual 1:1 with Alice, an unanswered 1:1 from Carol, a group.
  msg('vk', '1', 'me', 1),
  msg('vk', '1', '1', 2, { senderName: 'Alice Ivanova' }),
  msg('vk', '3', '3', 4, { senderName: 'Carol' }),
  msg('vk', '2000000001', '1', 5),
  msg('vk', '2000000001', '4', 6, { senderName: 'Фёдор Смирнов' }),
  msg('vk', '2000000001', 'me', 7),
  // telegram: the owner is "u1" (present in both 1:1 chats), not "me".
  msg('telegram', 'tgA', 'u1', 3, { chatType: 'private' }),
  msg('telegram', 'tgA', 'u100', 8, { chatType: 'private' }),
  msg('telegram', 'tgB', 'u1', 9, { chatType: 'private' }),
  msg('telegram', 'tgB', 'u200', 2, {
    chatType: 'private',
    senderName: 'Федор Смирнов',
  }),
  member('friends', 'friends', '1'),
  member('friends', 'friends', '5', 'Eve'),
  member('c77', 'community', '1'),
  member('c77', 'community', '5'),
  member('2000000001', 'chat', '6', 'Gleb'),
  member('vip', 'list', '3'),
  {
    ...personLink({
      source: 'vk',
      user: '1',
      name: 'Alice Ivanova',
      handle: 'alice_iv',
    }),
    sameAs: ['telegram:u100'],
  },
  personLink({ source: 'telegram', user: 'u100', name: 'alice  IVANOVA!' }),
  listLink({ id: 'blocked', members: ['vk:5'] }),
  listLink({ id: 'vip', members: ['vk:1', 'vk:5', 'telegram:u100'] }),
  listLink({ id: 'clients', members: ['vk:1', 'vk:3', 'vk:5'] }),
];

const keysOf = (people) => people.map((p) => p.key).sort();
const resolveKeys = (spec, extra = []) =>
  keysOf(resolveAudience([...links, ...extra], spec));

describe('people directory', () => {
  const { people, byKey, selfIds } = peopleIndex(links);

  it('detects the owner per network and leaves them out', () => {
    expect(selfIds.has('me')).toBe(true);
    expect(selfIds.has('u1')).toBe(true);
    expect(byKey.has('telegram:u1')).toBe(false);
    expect(byKey.has('vk:me')).toBe(false);
  });

  it('finds personal chats and whether both sides wrote', () => {
    const alice = byKey.get('vk:1');
    expect(alice.personalChat).toBe('1');
    expect(alice.mutual).toBe(true);
    expect(alice.lastMineAt).toBe('2026-09-01T12:00:00.000Z');
    expect(alice.lastTheirsAt).toBe('2026-09-02T12:00:00.000Z');
    // Her latest message anywhere is in the group chat.
    expect(alice.lastAt).toBe('2026-09-05T12:00:00.000Z');
    expect(alice.messages).toBe(3);
    expect(alice.chats.sort()).toEqual(['1', '2000000001']);
    const carol = byKey.get('vk:3');
    expect(carol.personalChat).toBe('3');
    expect(carol.mutual).toBe(false);
    expect(carol.lastMineAt).toBe(null);
    expect(byKey.get('vk:4').personalChat).toBe(null);
    expect(byKey.get('telegram:u100').mutual).toBe(true);
  });

  it('collects groups from messages, member links and lists', () => {
    expect(byKey.get('vk:1').groups.sort()).toEqual([
      'chat:1',
      'chat:2000000001',
      'community:c77',
      'friends',
      'list:clients',
      'list:vip',
    ]);
    const eve = byKey.get('vk:5');
    expect(eve.name).toBe('Eve');
    expect(eve.personalChat).toBe(null);
    expect(eve.lastAt).toBe(null);
    expect(eve.groups).toContain('list:blocked');
    expect(byKey.get('vk:6').chats).toEqual(['2000000001']);
    expect(byKey.get('vk:3').groups).toContain('list:vip');
  });

  it('prefers person links for names and keeps sameAs symmetric', () => {
    expect(byKey.get('vk:1').name).toBe('Alice Ivanova');
    expect(byKey.get('vk:1').handle).toBe('alice_iv');
    expect(byKey.get('vk:1').sameAs).toEqual(['telegram:u100']);
    expect(byKey.get('telegram:u100').sameAs).toEqual(['vk:1']);
    expect(byKey.get('vk:4').name).toBe('Фёдор Смирнов');
  });

  it('lists the most recently active first, silent members last', () => {
    expect(people[0].key).toBe('telegram:u200');
    expect(people.at(-1).lastAt).toBe(null);
  });

  it('honours explicit owner ids', () => {
    const keys = keysOf(buildPeople(links, { self: ['me', 'u100'] }));
    expect(keys).toContain('telegram:u1');
    expect(keys.includes('telegram:u100')).toBe(false);
  });
});

describe('searchPeople', () => {
  const people = buildPeople([
    ...links,
    personLink({ source: 'vk', user: '7', name: 'Ali' }),
    personLink({ source: 'vk', user: '8', name: 'Natalie' }),
  ]);
  const search = (q, opts) => searchPeople(people, q, opts).map((p) => p.key);

  it('ranks exact over prefix over substring, then linked accounts', () => {
    expect(search('ali')).toEqual(['vk:7', 'telegram:u100', 'vk:1', 'vk:8']);
  });

  it('matches handles, ids and keys, ignoring case and ё', () => {
    expect(search('ALICE_IV')).toEqual(['vk:1', 'telegram:u100']);
    expect(search('telegram:u2')).toEqual(['telegram:u200']);
    expect(search('федор')).toEqual(['telegram:u200', 'vk:4']);
  });

  it('returns everyone for an empty query, limited', () => {
    expect(search('').length).toBe(people.length);
    expect(search('', { limit: 2 })).toEqual([
      'telegram:u200',
      'telegram:u100',
    ]);
  });
});

describe('crossReference', () => {
  const suggestions = crossReference(buildPeople(links));

  it('suggests same names on different networks', () => {
    expect(suggestions).toEqual([
      {
        keys: ['telegram:u200', 'vk:4'],
        reasons: ['name'],
        value: 'федор смирнов',
        people: [
          {
            key: 'telegram:u200',
            source: 'telegram',
            user: 'u200',
            name: 'Федор Смирнов',
            handle: null,
          },
          {
            key: 'vk:4',
            source: 'vk',
            user: '4',
            name: 'Фёдор Смирнов',
            handle: null,
          },
        ],
      },
    ]);
  });

  it('leaves out people already joined by sameAs and same-network pairs', () => {
    const extra = [
      personLink({ source: 'vk', user: '9', name: 'Carol' }),
      personLink({ source: 'x', user: 'carol', handle: 'alice_iv' }),
    ];
    const found = crossReference(buildPeople([...links, ...extra]));
    expect(found.some((s) => s.value === 'alice ivanova')).toBe(false);
    expect(found.some((s) => s.value === 'carol')).toBe(false);
    // Handles match the same way: "alice_iv" normalises to "alice iv".
    const byHandle = found.find((s) => s.reasons.includes('handle'));
    expect([byHandle.value, ...byHandle.keys]).toEqual([
      'alice iv',
      'vk:1',
      'x:carol',
    ]);
  });
});

describe('resolveAudience', () => {
  it('resolves every atom kind', () => {
    expect(resolveKeys({ kind: 'all' }).length).toBe(buildPeople(links).length);
    expect(resolveKeys({ kind: 'friends' })).toEqual(['vk:1', 'vk:5']);
    expect(resolveKeys({ kind: 'friends', source: 'telegram' })).toEqual([]);
    expect(
      resolveKeys({ kind: 'chat', source: 'vk', chat: '2000000001' })
    ).toEqual(['vk:1', 'vk:4', 'vk:6']);
    expect(
      resolveKeys({ kind: 'community', source: 'vk', community: 'c77' })
    ).toEqual(['vk:1', 'vk:5']);
    expect(resolveKeys({ kind: 'list', id: 'vip' })).toEqual([
      'telegram:u100',
      'vk:1',
      'vk:3',
      'vk:5',
    ]);
    expect(resolveKeys({ kind: 'personal' })).toEqual([
      'telegram:u100',
      'telegram:u200',
      'vk:1',
      'vk:3',
    ]);
    expect(resolveKeys({ kind: 'personal', source: 'vk' })).toEqual([
      'vk:1',
      'vk:3',
    ]);
    expect(
      resolveKeys({ kind: 'query', q: 'network:vk AND chat:2000000001' })
    ).toEqual(['vk:1', 'vk:4']);
  });

  it('returns stubs for people keys the directory does not know', () => {
    const [alice, ghost] = resolveAudience(links, {
      kind: 'people',
      keys: ['vk:1', 'vk:404'],
    });
    expect(alice.personalChat).toBe('1');
    expect([ghost.key, ghost.source, ghost.personalChat]).toEqual([
      'vk:404',
      'vk',
      null,
    ]);
    expectError(() =>
      resolveAudience(links, { kind: 'people', keys: ['nosource'] })
    ).toThrow(/<source>:<user>/);
  });

  it('combines specs, including nested intersections of lists', () => {
    const lists = (...ids) => ids.map((id) => ({ kind: 'list', id }));
    expect(
      resolveKeys({ kind: 'intersect', of: lists('vip', 'clients') })
    ).toEqual(['vk:1', 'vk:3', 'vk:5']);
    expect(
      resolveKeys({
        kind: 'difference',
        of: [
          {
            kind: 'intersect',
            of: [
              ...lists('vip', 'clients'),
              {
                kind: 'union',
                of: [{ kind: 'friends' }, { kind: 'personal' }],
              },
            ],
          },
          ...lists('blocked'),
        ],
      })
    ).toEqual(['vk:1', 'vk:3']);
    expectError(() =>
      resolveAudience(links, { kind: 'union', of: [] })
    ).toThrow(/non-empty "of"/);
  });

  it('resolves saved audiences and refuses cycles', () => {
    const saved = [
      audienceLink({ id: 'core', spec: 'list:vip & list:clients' }),
      audienceLink({ id: 'a', spec: 'audience:b | friends' }),
      audienceLink({ id: 'b', spec: { kind: 'saved', id: 'a' } }),
    ];
    expect(resolveKeys('audience:core - list:blocked', saved)).toEqual([
      'vk:1',
      'vk:3',
    ]);
    expectError(() =>
      resolveAudience([...links, ...saved], { kind: 'saved', id: 'a' })
    ).toThrow('audience cycle: a -> b -> a');
    expectError(() => resolveAudience(links, 'audience:nope')).toThrow(
      'no saved audience "nope"'
    );
  });

  it('rejects unknown kinds and missing fields clearly', () => {
    expectError(() => resolveAudience(links, { kind: 'enemies' })).toThrow(
      /unknown audience kind "enemies"; known: all, friends/
    );
    expectError(() =>
      resolveAudience(links, { kind: 'chat', chat: '1' })
    ).toThrow('audience "chat" needs "source"');
    expectError(() => resolveAudience(links, null)).toThrow(/spec/);
  });
});

describe('audience text form', () => {
  it('parses with & and - binding tighter than |', () => {
    expect(
      parseAudienceSpec(
        'friends:vk & chat:vk:2000000001 - list:blocked | community:vk:123'
      )
    ).toEqual({
      kind: 'union',
      of: [
        {
          kind: 'difference',
          of: [
            {
              kind: 'intersect',
              of: [
                { kind: 'friends', source: 'vk' },
                { kind: 'chat', source: 'vk', chat: '2000000001' },
              ],
            },
            { kind: 'list', id: 'blocked' },
          ],
        },
        { kind: 'community', source: 'vk', community: '123' },
      ],
    });
  });

  it('reads every atom, quoted parts and hyphenated ids', () => {
    expect(
      parseAudienceSpec(
        'all | personal | personal:vk | friends | list:do-not-write | audience:x | person:vk:1 | q:"network:vk AND body:hi" | chat:vk:"a b"'
      ).of
    ).toEqual([
      { kind: 'all' },
      { kind: 'personal' },
      { kind: 'personal', source: 'vk' },
      { kind: 'friends' },
      { kind: 'list', id: 'do-not-write' },
      { kind: 'saved', id: 'x' },
      { kind: 'people', keys: ['vk:1'] },
      { kind: 'query', q: 'network:vk AND body:hi' },
      { kind: 'chat', source: 'vk', chat: 'a b' },
    ]);
  });

  it('round-trips text and specs', () => {
    for (const text of [
      'friends:vk & chat:vk:2000000001 - list:blocked | community:vk:123',
      '(friends | personal:telegram) & list:vip - (list:blocked | audience:old)',
      'list:a & (list:b & list:c) - person:vk:"x y"',
      '(list:a | list:b) | q:"sender:\\"bob\\" OR network:vk"',
      'community:vk:-123 - chat:vk:-1',
    ]) {
      const spec = parseAudienceSpec(text);
      const formatted = formatAudienceSpec(spec);
      expect(parseAudienceSpec(formatted)).toEqual(spec);
      expect(formatAudienceSpec(parseAudienceSpec(formatted))).toBe(formatted);
    }
    expect(
      formatAudienceSpec({
        kind: 'difference',
        of: [
          { kind: 'intersect', of: [{ kind: 'all' }, { kind: 'friends' }] },
          { kind: 'list', id: 'x' },
        ],
      })
    ).toBe('(all & friends) - list:x');
  });

  it('reports bad text', () => {
    for (const [text, error] of [
      ['', 'the audience text is empty'],
      ['friends &', /ends where/],
      ['(friends', 'missing ")" for the "(" at 0'],
      ['friends)', 'unexpected ")" at 7'],
      ['friends list:x', 'unexpected "list:x" at 8'],
      ['enemies', /unknown audience "enemies" at 0/],
      ['chat:vk', '"chat" needs <source>:<chat>'],
      ['list:', /needs a value/],
      ['all:vk', '"all" takes no value'],
      ['q:"abc', 'unterminated quote at 2'],
    ]) {
      expectError(() => parseAudienceSpec(text)).toThrow(error);
    }
    expectError(() => formatAudienceSpec({ kind: 'enemies' })).toThrow(
      /unknown/
    );
  });
});
