// Find the user's own Telegram sign-ins across their repositories: bot
// tokens and GramJS user sessions, grouped by account. The scanner reads
// only on this computer and never returns a raw value — the assertions
// below guard that masking contract.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';

import {
  createTelegramCreds,
  parseEnv,
  maskHint,
  maskEnds,
} from '../src/web/../sources/auto-import/telegram-creds.js';

const BOT_TOKEN = '7654321:AAFakeBotTokenForTestsOnly_abcdefghijklmn';
const USER_SESSION = `1${'Ab9Zx'.repeat(14)}`; // long single-line string
const API_ID = '2040';
const API_HASH = '0123456789abcdef0123456789abcdef';
const PHONE = '+15551234567';

const tmpDir = () => fs.mkdtemp(path.join(os.tmpdir(), 'ms-tg-creds-'));

// A little tree: a bot repo and a user-session repo (konard/telegram-bot
// shape — `.telegram_session` beside `.env` with api_id/api_hash/phone).
const makeTree = async () => {
  const root = await tmpDir();
  const botRepo = path.join(root, 'my-bot');
  const userRepo = path.join(root, 'telegram-bot');
  const noise = path.join(root, 'telegram-bot', 'node_modules', 'x');
  await fs.mkdir(botRepo, { recursive: true });
  await fs.mkdir(userRepo, { recursive: true });
  await fs.mkdir(noise, { recursive: true });
  await fs.writeFile(
    path.join(botRepo, '.env'),
    `# a bot\nTELEGRAM_BOT_TOKEN=${BOT_TOKEN}\nOTHER_SECRET=ignore-me-please\n`
  );
  await fs.writeFile(
    path.join(userRepo, '.env'),
    `TELEGRAM_API_ID=${API_ID}\nTELEGRAM_API_HASH=${API_HASH}\nTELEGRAM_PHONE=${PHONE}\n`
  );
  await fs.writeFile(
    path.join(userRepo, '.telegram_session'),
    `${USER_SESSION}\n`
  );
  // A credential inside node_modules must be skipped.
  await fs.writeFile(path.join(noise, '.env'), `BOT_TOKEN=${BOT_TOKEN}\n`);
  // A template with placeholders must never be mistaken for a credential.
  await fs.writeFile(
    path.join(botRepo, '.env.example'),
    'TELEGRAM_BOT_TOKEN=your-token-here\nTELEGRAM_SESSION=${SESSION}\n'
  );
  await fs.writeFile(
    path.join(botRepo, '.env.local'),
    'BOT_TOKEN=123:changeme-placeholder-value-goes-right-here\n'
  );
  return { root, botRepo, userRepo };
};

const credsFor = async (overrides = {}) => {
  const dataDir = await tmpDir();
  const calls = { getMe: [] };
  const fetchImpl = async (url) => {
    calls.getMe.push(url);
    return {
      ok: true,
      json: async () => ({
        ok: true,
        result: { id: 777, username: 'fake_test_bot', first_name: 'Fake' },
      }),
    };
  };
  const creds = createTelegramCreds({ dataDir, fetchImpl, ...overrides });
  return { creds, dataDir, calls };
};

test('parseEnv reads KEY=VALUE, export and quotes; skips comments', () => {
  const fields = parseEnv(
    '# c\nexport A=1\nB = "two"\nC=\'three\'\nbad line\nD=four\n'
  );
  assert.deepEqual(fields, [
    { key: 'A', value: '1' },
    { key: 'B', value: 'two' },
    { key: 'C', value: 'three' },
    { key: 'D', value: 'four' },
  ]);
});

test('maskHint shows only the last four characters', () => {
  assert.equal(maskHint('abcdefghij1234'), '••••1234');
  assert.equal(maskHint(''), '••••');
});

test('maskEnds reveals three characters at each end of a long value', () => {
  assert.equal(maskEnds('ABCdefghij1234567'), 'ABC•••••567');
  // Short values are not over-exposed: they fall back to the tail-only mask.
  assert.equal(maskEnds('short'), '••••hort');
  assert.equal(maskEnds(''), '••••');
});

test('scan finds bot tokens and user sessions, never returns values', async () => {
  const { root } = await makeTree();
  const { creds } = await credsFor();
  const result = await creds.scan({ roots: [root] });

  const kinds = result.entries.map((e) => e.kind).sort();
  assert.deepEqual(kinds, ['bot-token', 'user-session']);
  // node_modules was skipped, so the bot token appears exactly once.
  assert.equal(result.entries.filter((e) => e.kind === 'bot-token').length, 1);

  // `.env.example` placeholders and `${SESSION}` refs are not credentials.
  assert.equal(result.entries.length, 2, 'placeholders/templates excluded');

  const blob = JSON.stringify(result);
  assert.doesNotMatch(blob, /AAFakeBotToken/, 'bot token value leaked');
  assert.doesNotMatch(blob, new RegExp(USER_SESSION), 'session value leaked');
  assert.doesNotMatch(blob, /0123456789abcdef/, 'api hash leaked');
  // The user entry carries a masked hint (both ends shown, middle hidden)
  // and a masked phone, nothing more.
  const user = result.entries.find((e) => e.kind === 'user-session');
  assert.match(user.hint, /^.{3}•••••.{3}$/);
  assert.equal(user.hint, maskEnds(USER_SESSION));
  assert.match(user.phone, /^••••/);
  assert.match(user.where, /telegram-bot/);
});

test('the owner-only cache holds values at 0600 and 0700', async () => {
  if (process.platform === 'win32') {
    return;
  }
  const { root } = await makeTree();
  const { creds, dataDir } = await credsFor();
  await creds.scan({ roots: [root] });
  const dir = path.join(dataDir, 'auto-import', 'telegram');
  assert.equal((await fs.stat(dir)).mode & 0o777, 0o700);
  assert.equal(
    (await fs.stat(path.join(dir, 'found.json'))).mode & 0o777,
    0o600
  );
});

test('identify groups a bot by getMe and a user session by phone', async () => {
  const { root } = await makeTree();
  const { creds, calls } = await credsFor();
  await creds.scan({ roots: [root] });
  const { groups } = await creds.identify();

  assert.equal(calls.getMe.length, 1, 'getMe called once for the bot token');
  assert.match(calls.getMe[0], /\/bot\d+:[^/]+\/getMe$/);

  const bot = groups.find((g) => g.account.kind === 'bot');
  const user = groups.find((g) => g.account.kind === 'user');
  assert.equal(bot.account.label, '@fake_test_bot');
  assert.equal(bot.account.verified, true);
  // Without an MTProto client the user session groups by phone, unverified.
  assert.equal(user.account.verified, false);
  assert.match(user.account.label, /••••/);
  assert.doesNotMatch(JSON.stringify(groups), /AAFakeBotToken/);
});

test('identify verifies a user session when an MTProto client is given', async () => {
  const { root } = await makeTree();
  const seen = [];
  const mtproto = async ({ apiId, apiHash, session }) => {
    seen.push({ apiId, apiHash, session });
    return { getMe: async () => ({ id: 42, username: 'konard' }) };
  };
  const { creds } = await credsFor({ mtproto });
  await creds.scan({ roots: [root] });
  const { groups } = await creds.identify();
  const user = groups.find((g) => g.account.kind === 'user');
  assert.equal(user.account.label, '@konard');
  assert.equal(user.account.verified, true);
  // The sibling .env api_id/api_hash were paired with the session file.
  assert.equal(seen[0].apiId, 2040);
  assert.equal(seen[0].session, USER_SESSION);
});

test('the same token in many repos collapses to one entry, all locations kept', async () => {
  const root = await tmpDir();
  for (const name of ['repo-a', 'repo-b', 'repo-c']) {
    const repo = path.join(root, name);
    await fs.mkdir(repo, { recursive: true });
    await fs.writeFile(path.join(repo, '.env'), `BOT_TOKEN=${BOT_TOKEN}\n`);
  }
  const { creds } = await credsFor();
  const result = await creds.scan({ roots: [root] });
  const bots = result.entries.filter((e) => e.kind === 'bot-token');
  assert.equal(bots.length, 1, 'one distinct token, not three');
  assert.equal(bots[0].wheres.length, 3, 'every location is remembered');
  assert.equal(result.groups.length, 1, 'one account group');
});

test('scan lists only live credentials; a token Telegram rejects is dropped', async () => {
  const root = await tmpDir();
  const good = path.join(root, 'good');
  const dead = path.join(root, 'dead');
  await fs.mkdir(good, { recursive: true });
  await fs.mkdir(dead, { recursive: true });
  const DEAD = '111222:AADeadRevokedBotTokenForTestsOnly_zyxwvut';
  await fs.writeFile(path.join(good, '.env'), `BOT_TOKEN=${BOT_TOKEN}\n`);
  await fs.writeFile(path.join(dead, '.env'), `BOT_TOKEN=${DEAD}\n`);
  const fetchImpl = async (url) => ({
    ok: true,
    json: async () =>
      url.includes(DEAD)
        ? { ok: false, result: null }
        : { ok: true, result: { id: 5, username: 'live_bot' } },
  });
  const creds = createTelegramCreds({ dataDir: await tmpDir(), fetchImpl });
  const result = await creds.scan({ roots: [root] });
  const hints = result.entries.map((e) => e.hint);
  assert.equal(result.entries.length, 1, 'the revoked token is not listed');
  assert.equal(result.entries[0].active, true);
  assert.ok(!hints.includes(maskHint(DEAD)));
});

test('a bare api_id/api_hash/phone trio becomes a phone-login entry', async () => {
  const root = await tmpDir();
  const repo = path.join(root, 'creds-only');
  await fs.mkdir(repo, { recursive: true });
  await fs.writeFile(
    path.join(repo, '.env'),
    `TELEGRAM_API_ID=${API_ID}\nTELEGRAM_API_HASH=${API_HASH}\nTELEGRAM_PHONE=${PHONE}\n`
  );
  const { creds } = await credsFor();
  const result = await creds.scan({ roots: [root] });
  const login = result.entries.find((e) => e.type === 'user-password');
  assert.ok(login, 'a phone & password login is offered');
  assert.equal(login.hint, null, 'no secret value for a phone-login');
  assert.match(login.phone, /^••••/);
  // No value escapes, and `use` reports it needs the interactive sign-in.
  assert.doesNotMatch(JSON.stringify(result), /0123456789abcdef/);
  const outcome = await creds.use(login.id, { store: { put: async () => {} } });
  assert.equal(outcome.needsLogin, true);
  const ctx = await creds.loginContext(login.id);
  assert.equal(ctx.apiId, API_ID);
  assert.equal(ctx.phone, PHONE);
});

test('sessions and a phone-login on one number fold into one verified account', async () => {
  const root = await tmpDir();
  const a = path.join(root, 'repo-a');
  const b = path.join(root, 'repo-b');
  await fs.mkdir(a, { recursive: true });
  await fs.mkdir(b, { recursive: true });
  // repo-a: a session + its api trio. repo-b: only the api trio (phone-login).
  await fs.writeFile(
    path.join(a, '.env'),
    `TELEGRAM_API_ID=${API_ID}\nTELEGRAM_API_HASH=${API_HASH}\nTELEGRAM_PHONE=${PHONE}\n`
  );
  await fs.writeFile(path.join(a, '.telegram_session'), `${USER_SESSION}\n`);
  await fs.writeFile(
    path.join(b, '.env'),
    `API_ID=${API_ID}\nAPI_HASH=${API_HASH}\nPHONE=${PHONE}\n`
  );
  const mtproto = async () => ({
    getMe: async () => ({ id: 42, username: 'konard', phone: '15551234567' }),
  });
  const { creds } = await credsFor({ mtproto });
  const result = await creds.scan({ roots: [root] });
  assert.equal(result.groups.length, 1, 'all one account');
  assert.equal(result.groups[0].account.label, '@konard');
  assert.equal(result.groups[0].account.verified, true);
  // The redundant phone-login beside a working session is dropped.
  const types = result.entries.map((e) => e.type).sort();
  assert.deepEqual(types, ['session']);
});

test('different sessions for one account collapse to a single entry', async () => {
  const root = await tmpDir();
  // Two DIFFERENT session strings for the same user, in three repos, each
  // beside the api_id/api_hash needed to verify them.
  const sessionA = `1${'Aa1Bb'.repeat(14)}`;
  const sessionB = `2${'Cc3Dd'.repeat(14)}`;
  const env = `TELEGRAM_API_ID=${API_ID}\nTELEGRAM_API_HASH=${API_HASH}\nTELEGRAM_PHONE=${PHONE}\n`;
  for (const [name, session] of [
    ['broadcast', sessionA],
    ['follow', sessionA],
    ['telegram-bot', sessionB],
  ]) {
    const repo = path.join(root, name);
    await fs.mkdir(repo, { recursive: true });
    await fs.writeFile(path.join(repo, '.env'), env);
    await fs.writeFile(path.join(repo, '.telegram_session'), `${session}\n`);
  }
  // MTProto resolves every session to the same account.
  const mtproto = async () => ({
    getMe: async () => ({ id: 567, username: 'konard', phone: '15551234567' }),
  });
  const { creds } = await credsFor({ mtproto });
  const result = await creds.scan({ roots: [root] });
  assert.equal(result.groups.length, 1, 'one account');
  assert.equal(result.groups[0].entries.length, 1, 'one login-by-session row');
  const entry = result.groups[0].entries[0];
  assert.equal(entry.type, 'session');
  // All three repos are remembered on the single entry.
  assert.equal(entry.wheres.length, 3);
  assert.equal(result.entries.length, 1, 'the flat list agrees');
});

test('user accounts are listed before bot accounts', async () => {
  // makeTree has one bot repo and one user-session repo; the finder must
  // put the user account first and the bot after.
  const { root } = await makeTree();
  const { creds } = await credsFor();
  const result = await creds.scan({ roots: [root] });
  const kinds = result.groups.map((g) => g.account.kind);
  assert.deepEqual(kinds, ['user', 'bot'], 'users first, bots after');
  // The flat entry list follows the same order.
  assert.equal(result.entries[0].type, 'session');
  assert.equal(result.entries[result.entries.length - 1].type, 'bot');
});

test('a BigInt account id from GramJS never breaks serialization', async () => {
  const { root } = await makeTree();
  // GramJS returns the user id as a BigInt; the result must still stringify.
  const mtproto = async () => ({
    getMe: async () => ({ id: 42n, username: 'konard', phone: '15551234567' }),
  });
  const { creds } = await credsFor({ mtproto });
  const result = await creds.scan({ roots: [root] });
  assert.doesNotThrow(() => JSON.stringify(result), 'result is serializable');
  // And a second scan reads the cache it just wrote without throwing.
  await assert.doesNotReject(() => creds.scan({ roots: [root] }));
});

test('use writes the matching secret links and no plaintext escapes', async () => {
  const { root } = await makeTree();
  const { creds } = await credsFor();
  const scan = await creds.scan({ roots: [root] });
  const botId = scan.entries.find((e) => e.kind === 'bot-token').id;
  const userId = scan.entries.find((e) => e.kind === 'user-session').id;

  const puts = [];
  const store = { put: async (link) => puts.push(link) };

  const botResult = await creds.use(botId, { store });
  assert.equal(botResult.kind, 'bot-token');
  assert.match(botResult.hint, /•••••/);
  assert.ok(puts.find((l) => l.id === 'secret:telegram:bot-token'));

  await creds.use(userId, { store });
  const ids = puts.map((l) => l.id);
  assert.ok(ids.includes('secret:telegram:user-session'));
  assert.ok(ids.includes('secret:telegram:api-id'));
  assert.ok(ids.includes('secret:telegram:api-hash'));
  // The stored links DO carry the values (they are the secret store's job
  // to encrypt) — but a missing credential must fail loudly.
  await assert.rejects(() => creds.use('nope', { store }), /unknown/);
});
