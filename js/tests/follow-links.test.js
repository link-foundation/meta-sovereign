import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseTelegramLink,
  extractTelegramLinks,
} from '../src/follow/telegram-links.js';
import {
  extractFollowLinks,
  listFollowLinks,
  clearFollowLinks,
} from '../src/follow/link-cache.js';
import { followLinksFixture } from './helpers/follow-links.mjs';
import { createMemoryStore } from '../src/storage/universal.js';

test('Telegram aliases, legacy and native invites preserve complete case-sensitive hashes', () => {
  for (const url of [
    'https://t.me/+AbC_123-xyz',
    'telegram.me/joinchat/AbC_123-xyz',
    'https://telegram.dog/+AbC_123-xyz',
    'tg://join?invite=AbC_123-xyz',
  ]) {
    assert.deepEqual(parseTelegramLink(url), {
      kind: 'invite',
      invite: 'AbC_123-xyz',
      url: 'https://t.me/+AbC_123-xyz',
    });
  }
  for (const url of [
    't.me/Study_Group',
    'https://www.telegram.me/Study_Group',
    '@Study_Group',
    'tg://resolve?domain=Study_Group',
  ]) {
    assert.deepEqual(parseTelegramLink(url), {
      kind: 'public',
      username: 'study_group',
      url: 'https://t.me/study_group',
    });
  }
});

test('message links remain distinct from join candidates and invalid hosts or phone links are excluded', () => {
  assert.equal(
    parseTelegramLink('https://t.me/c/1234/5').kind,
    'private-message'
  );
  assert.equal(
    parseTelegramLink('https://t.me/s/study_group/4').kind,
    'message'
  );
  for (const url of [
    'https://t.me.evil/study_group',
    'https://evil.t.me/study_group',
    'https://user:pass@t.me/study_group',
    'https://t.me:9999/study_group',
    'https://t.me/+12345678901',
    'https://t.me/share/url?url=x',
    'https://t.me/joinchat',
    'https://t.me/c/1234',
    'https://t.me/c/1234/0',
    'https://t.me/Study_Group/invalid',
  ]) {
    assert.equal(parseTelegramLink(url), null, url);
  }
});

test('extraction deduplicates aliases within a message and ignores email and host substrings', () => {
  const result = extractTelegramLinks([
    'See (https://t.me/Study_Group), @study_group; https://telegram.me/Study_Group. person@Another_Group.com https://evil.t.me/Bad_Group https://t.me.evil/Bad_Group',
  ]);
  assert.deepEqual(
    result.links.map((link) => link.url),
    ['https://t.me/study_group']
  );
  assert.equal(result.limited, false);
});

test('streamed incoming extraction preserves separate provenance and is idempotent; filtered clearing keeps messages and secrets', async () => {
  const { store, messages } = await followLinksFixture();
  store.query = () => {
    throw new Error('production scan must not materialize the archive');
  };
  const result = await extractFollowLinks(store);
  assert.deepEqual(result.coverage, {
    messages: 2,
    scanned: 2,
    truncatedMessages: 0,
    limited: false,
  });
  assert.equal(result.added, 4);
  assert.equal((await extractFollowLinks(store)).added, 0);
  const page = await listFollowLinks(store, { limit: 2 });
  assert.equal(page.total, 4);
  assert.equal(page.more, true);
  assert.equal(page.links[0].messageId, messages[0].id);
  assert.equal(page.links[0].chat, messages[0].chat);
  assert.equal(
    (await listFollowLinks(store, { offset: 2, limit: 2 })).more,
    false
  );
  assert.equal((await clearFollowLinks(store, { source: 'vk' })).cleared, 2);
  assert.equal((await listFollowLinks(store)).total, 2);
  for (const message of messages) {
    assert.ok(await store.get(message.id));
  }
  assert.ok(await store.get('secret:follow-fixture'));
});

test('message and field limits report incomplete extraction; full scan and explicit self IDs recover coverage', async () => {
  const { store } = await followLinksFixture();
  await store.put({
    id: 'msg:vk:other:1',
    source: 'vk',
    chat: 'other',
    sender: 'owner',
    body: 'https://t.me/Owner_Group',
  });
  const first = await extractFollowLinks(store, { limit: 1, self: ['owner'] });
  assert.equal(first.coverage.messages, 2);
  assert.equal(first.coverage.scanned, 1);
  assert.equal(first.coverage.limited, true);
  const all = await extractFollowLinks(store, { limit: 0, self: ['owner'] });
  assert.equal(all.coverage.limited, false);
  assert.equal((await listFollowLinks(store)).total, 4);
  const large = extractTelegramLinks([
    `${'x'.repeat(65536)} https://t.me/Late_Group`,
  ]);
  assert.equal(large.limited, true);
  assert.equal(large.links.length, 0);
  assert.equal(extractTelegramLinks(Array(130).fill(undefined)).limited, true);
});

test('attachment and hidden-entity links are extracted without indexing raw message bodies or network access', async () => {
  const store = createMemoryStore();
  await store.put({
    id: 'msg:vk:1:1',
    source: 'vk',
    chat: '1',
    sender: 'friend',
    body: 'Private text stays in its message',
    raw: {
      attachments: [{ link: { url: 'https://t.me/+AbCd1234567' } }],
      entities: [{ url: 'https://t.me/Entity_Group' }],
    },
  });
  assert.equal((await extractFollowLinks(store)).added, 2);
  const result = await listFollowLinks(store);
  assert.equal(JSON.stringify(result).includes('Private text'), false);
});

test('invalid limits fail before writes and overlapping cache mutations cannot race', async () => {
  const { store } = await followLinksFixture();
  for (const limit of [-1, NaN, 1.5, 1000001, null, '', true, {}, []]) {
    await assert.rejects(extractFollowLinks(store, { limit }), /integer/u);
  }
  await assert.rejects(extractFollowLinks(store, { self: 'owner' }), /array/u);
  const original = store.scan;
  let resume;
  store.scan = async (...args) => {
    await new Promise((resolve) => {
      resume = resolve;
    });
    return original(...args);
  };
  const pending = extractFollowLinks(store);
  await assert.rejects(clearFollowLinks(store), { code: 'follow-cache-busy' });
  resume();
  await pending;
  store.scan = original;
  assert.equal((await clearFollowLinks(store)).cleared, 4);
});
