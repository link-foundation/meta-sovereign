// Find the user's own Telegram sign-ins across their repositories: bot
// tokens and GramJS user sessions, grouped by account. The scanner reads
// only on this computer and never returns a raw value — the assertions
// below guard that masking contract.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  createTelegramCreds,
  parseEnv,
  maskHint,
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
  // The user entry carries a masked hint and a masked phone, nothing more.
  const user = result.entries.find((e) => e.kind === 'user-session');
  assert.match(user.hint, /^••••/);
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
  assert.match(botResult.hint, /^••••/);
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
