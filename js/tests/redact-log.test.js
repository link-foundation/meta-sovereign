// R-Z2: no credential reaches a log line or a stored error; the log file
// is private and rotated by size.

import { assertMode } from './helpers/mode.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { redact, safeMessage } from '../src/server/redact.js';
import { createServerLog, jsonLog } from '../src/server/log.js';

const BOT = '123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw';

test('redact blanks tokens, headers, fields and sessions', () => {
  const cases = [
    [`GET https://api.telegram.org/bot${BOT}/getMe failed`, BOT],
    [`fetch https://api.telegram.org/file/bot${BOT}/photos/1.jpg`, BOT],
    ['Authorization: Bearer abc.def.ghi-123456', 'abc.def.ghi'],
    ['{"authorization":"Basic dXNlcjpwYXNz"}', 'dXNlcjpwYXNz'],
    ['GET /cb?code=1&access_token=ya29.SECRETVALUE&x=2', 'SECRETVALUE'],
    ['/x?session=SESSIONVALUE123', 'SESSIONVALUE123'],
    ['{"password":"hunter2","ok":true}', 'hunter2'],
    [
      '{"session":"1BAAOMTQ5LjE1NC4xNjcuNTE","a":1}',
      '1BAAOMTQ5LjE1NC4xNjcuNTE',
    ],
    // (split, so that a secret scanner does not take the fixture for a secret)
    [`${'postgres'}://user:pa55w0rd@host/db`, 'pa55w0rd'],
    [`sess ${'A1b2'.repeat(60)}`, 'A1b2A1b2A1b2A1b2'],
    ['Cookie: sid=abcdef123456; other=1', 'abcdef123456'],
  ];
  for (const [input, secret] of cases) {
    const out = redact(input);
    assert.ok(!out.includes(secret), `${input} -> ${out}`);
    assert.ok(out.includes('<redacted>'), out);
  }
  assert.equal(redact('plain message 42'), 'plain message 42');
  assert.equal(redact(undefined), undefined);
  assert.ok(!safeMessage(new Error(`bad ${BOT}`)).includes(BOT));
});

test('every log line is redacted, errors and stacks included', () => {
  const lines = [];
  const log = jsonLog({ write: (line) => lines.push(line) });
  log({
    event: 'http_failed',
    error: `request to https://api.telegram.org/bot${BOT}/sendMessage failed`,
    stack: `Error: Authorization: Bearer topsecret-token-1234\n at x`,
  });
  assert.equal(lines.length, 1);
  assert.ok(!lines[0].includes(BOT));
  assert.ok(!lines[0].includes('topsecret-token'));
  JSON.parse(lines[0]); // still one valid JSON object
});

test('the log file is private and rotated by size, keeping a few', async () => {
  const storeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ms-z2-log-'));
  const logs = path.join(storeDir, 'logs');
  await fs.mkdir(logs, { mode: 0o755 });
  await fs.writeFile(path.join(logs, 'meta-sovereign.log'), '', {
    mode: 0o644,
  });
  const { log, file, close } = await createServerLog({
    storeDir,
    toStdout: false,
    maxBytes: 2000,
    keep: 2,
  });
  await assertMode(file, 0o600);
  await assertMode(logs, 0o700);
  for (let i = 0; i < 60; i += 1) {
    log({ event: 'tick', i, url: `/bot${BOT}/x`, pad: 'x'.repeat(100) });
  }
  await close();
  const names = (await fs.readdir(logs)).sort();
  assert.deepEqual(names, [
    'meta-sovereign.log',
    'meta-sovereign.log.1',
    'meta-sovereign.log.2',
  ]);
  for (const name of names) {
    const text = await fs.readFile(path.join(logs, name), 'utf8');
    assert.ok(!text.includes(BOT));
    assert.ok(text.length <= 2200);
  }
});
