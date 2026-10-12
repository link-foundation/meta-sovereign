// Issue #31 / PR #34: `automations` in the terminal — plan previews,
// `run` queues drafts in safe mode, `review` sends one message per "y"
// (edit, switch ты/вы, mark sent, skip, quit), and auto mode sends only
// with --confirm=true.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createMemoryStore } from '../src/storage/index.js';
import { buildMessageLink } from '../src/sources/link.js';
import { runCli } from '../src/cli/index.js';
import { createAutomationCommands } from '../src/cli/automation-commands.js';
import { DAY_MS } from '../src/crm/reengage.js';

const NOW = '2026-10-01T00:00:00Z';
const ago = (n) => new Date(Date.parse(NOW) - n * DAY_MS).toISOString();

const seed = async () => {
  const store = createMemoryStore();
  let id = 0;
  const put = (chat, sender, body, days) =>
    store.put(
      buildMessageLink({
        source: 'vk',
        externalId: String((id += 1)),
        sender,
        chat,
        body,
        timestamp: ago(days),
      })
    );
  await put('101', 'me', 'Привет, как ты?', 130);
  await put('101', 'alice', 'Норм, а ты?', 120);
  await put('102', 'me', 'Здравствуйте, вы сможете помочь?', 200);
  await put('102', 'bob', 'Да', 200);
  await put('103', 'me', 'Привет', 5);
  await put('103', 'carol', 'Привет', 5);
  return store;
};

const cli = (store, { answers = [], send } = {}) => {
  const sent = [];
  const typing = [];
  const commands = createAutomationCommands({
    openStore: async () => store,
    ask: async () => answers.shift() ?? 'q',
    send:
      send ??
      (async (draft) => {
        sent.push(draft);
        return { ok: true, via: 'api' };
      }),
    setTyping: async (chat) => typing.push(chat),
    sleep: async () => {},
  });
  const run = async (sub, args = {}) => {
    const out = [];
    const code = await commands.automations(
      { _: sub, now: NOW, ...args },
      (line) => out.push(line)
    );
    return { code, text: out.join('\n') };
  };
  return { run, sent, typing };
};

const DORMANT = 'reengage-dormant';

test('list: presets until saved, with mode and triggers', async () => {
  const { run } = cli(await seed());
  const { code, text } = await run(['list']);
  assert.equal(code, 0);
  assert.match(
    text,
    /automation:reengage-dormant\tsafe\tmanual\+chat-menu\tSay hi.*\[preset\]/
  );
  assert.match(
    text,
    /automation:greet-back\tsafe\tincoming\+chat-menu \(off\)/
  );
});

test('plan: previews who gets what, writes nothing', async () => {
  const store = await seed();
  const { run, sent } = cli(store);
  const { code, text } = await run(['plan', DORMANT]);
  assert.equal(code, 0);
  assert.match(text, /2 to message \(preview — nothing was sent\)/);
  assert.match(text, /Тебе или твоим друзьям/);
  assert.match(text, /Вам или вашим друзьям/);
  assert.match(text, /left out: talked-recently×1/);
  assert.equal(sent.length, 0);
  const drafts = await store.query((l) => l.id.startsWith('automation-draft:'));
  assert.equal(drafts.length, 0);
  const json = JSON.parse((await run(['plan', DORMANT], { json: true })).text);
  assert.deepEqual(json.drafts.map((d) => d.form).sort(), [
    'formal',
    'informal',
  ]);
});

test('plan --chat --test: one chosen chat, conditions ignored', async () => {
  const { run } = cli(await seed());
  const { text } = await run(['plan', DORMANT], {
    chat: 'vk:103',
    test: true,
  });
  assert.match(text, /1 to message/);
  assert.match(text, /vk:103/);
  const bad = await run(['plan', DORMANT], { chat: 'vk' });
  assert.equal(bad.code, 1);
  assert.match(bad.text, /--chat expects source:chat/);
});

test('safe mode: run queues, review sends only what the user confirms', async () => {
  const store = await seed();
  const { run, sent, typing } = cli(store, { answers: ['y', 's'] });
  const queued = await run(['run', DORMANT]);
  assert.equal(queued.code, 0);
  assert.match(queued.text, /2 draft\(s\) queued/);
  assert.equal(sent.length, 0);
  assert.match((await run(['drafts'])).text, /2 pending draft\(s\)/);

  const { code, text } = await run(['review']);
  assert.equal(code, 0);
  assert.equal(sent.length, 1);
  assert.equal(typing.length, 1);
  assert.match(text, /sent 1, skipped 1, failed 0, left 0/);
  const history = await run(['history']);
  assert.match(history.text, /\tsent\tvk:/);
  assert.match(history.text, /\tskipped\tvk:/);
  // Both are inside the cooldown, so the next plan offers no one.
  assert.match((await run(['plan', DORMANT])).text, /0 to message/);
});

test('review: switch the form, edit, mark as sent by hand, quit', async () => {
  const store = await seed();
  const { run, sent } = cli(store, {
    answers: ['f', 'e', 'Свой\\nтекст', 'y', 'm'],
  });
  await run(['run', DORMANT]);
  const { text } = await run(['review']);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].text, 'Свой\nтекст');
  assert.match(text, /sent \(by you\)/);
  assert.match(text, /sent 2, skipped 0, failed 0, left 0/);
});

test('review: a failed send keeps the draft and says so', async () => {
  const store = await seed();
  const { run } = cli(store, {
    answers: ['y', 'q'],
    send: async () => {
      throw new Error('blocked');
    },
  });
  await run(['run', DORMANT]);
  const { text } = await run(['review']);
  assert.match(text, /not sent: blocked/);
  assert.match(text, /failed 1, left 2/);
  assert.match((await run(['drafts'])).text, /2 pending draft\(s\)/);
});

test('auto mode: shows the plan, sends only once confirmed', async () => {
  const store = await seed();
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ms-automation-'));
  const file = path.join(dir, 'auto.json');
  await fs.writeFile(
    file,
    JSON.stringify({
      id: 'say-hi-auto',
      name: 'Say hi (auto)',
      mode: 'auto',
      conditions: { silentDays: 90, mutual: true },
    })
  );
  const { run, sent } = cli(store);
  assert.match(
    (await run(['save', file])).text,
    /saved automation:say-hi-auto/
  );
  const refused = await run(['run', 'say-hi-auto']);
  assert.equal(refused.code, 1);
  // The user sees who would get what before anything is sent.
  assert.match(refused.text, /2 to message \(preview — nothing was sent\)/);
  assert.match(refused.text, /Send 2 messages now\?|Send 2 message\(s\) now\?/);
  assert.match(refused.text, /pass --yes/);
  assert.equal(sent.length, 0);
  const ok = await run(['run', 'say-hi-auto'], { confirm: 'true' });
  assert.equal(ok.code, 0);
  assert.equal(sent.length, 2);
  assert.match(ok.text, /^sent\tvk:/m);
  assert.match((await run(['delete', 'say-hi-auto'])).text, /deleted/);
  assert.doesNotMatch((await run(['list'])).text, /say-hi-auto/);
  await fs.rm(dir, { recursive: true, force: true });
});

test('errors and help', async () => {
  const { run } = cli(await seed());
  const unknown = await run(['explode']);
  assert.equal(unknown.code, 1);
  assert.match(unknown.text, /unknown subcommand "explode"/);
  const missing = await run(['plan', 'nope']);
  assert.equal(missing.code, 1);
  assert.match(missing.text, /no automation automation:nope/);
  const out = [];
  await runCli(['help'], { log: (m) => out.push(m) });
  assert.match(out.join('\n'), /automations {3}\[list\] \| plan <id>/);
  assert.doesNotMatch(out.join('\n'), /reengage/);
});
