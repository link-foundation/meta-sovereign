// Issue #31 / R-X8: the `reengage` command previews by default, sends
// one message per "y" in interactive (safe) mode, and sends the whole
// plan only with --mode=batch --confirm=true.

import { describe, it, expect } from 'test-anywhere';

import { createMemoryStore } from '../src/storage/index.js';
import { buildMessageLink } from '../src/sources/link.js';
import { runCli } from '../src/cli/index.js';
import { createReengageCommands } from '../src/cli/reengage-commands.js';
import { DAY_MS, defaultReengageTemplates } from '../src/crm/reengage.js';

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
  const commands = createReengageCommands({
    openStore: async () => store,
    ask: async () => answers.shift() ?? 'q',
    send:
      send ??
      (async (draft) => {
        sent.push(draft);
        return { ok: true };
      }),
  });
  const run = async (args) => {
    const out = [];
    const code = await commands.reengage({ now: NOW, ...args }, (line) =>
      out.push(line)
    );
    return { code, text: out.join('\n') };
  };
  return { run, sent };
};

describe('reengage cli', () => {
  it('previews the plan without sending anything', async () => {
    const { run, sent } = cli(await seed());
    const { code, text } = await run({});
    expect(code).toBe(0);
    expect(text.includes('2 personal contact(s)')).toBe(true);
    expect(text.includes('nothing was sent')).toBe(true);
    expect(text.includes('Тебе или твоим друзьям')).toBe(true);
    expect(text.includes('Вам или вашим друзьям')).toBe(true);
    expect(sent.length).toBe(0);
  });
  it('prints the plan as JSON', async () => {
    const { run } = cli(await seed());
    const { text } = await run({ json: true });
    const plan = JSON.parse(text);
    expect(plan.drafts.map((d) => d.form).sort()).toEqual([
      'formal',
      'informal',
    ]);
  });
  it('interactive mode sends only what the user confirms', async () => {
    const store = await seed();
    const { run, sent } = cli(store, { answers: ['y', 's'] });
    const { code, text } = await run({ interactive: true });
    expect(code).toBe(0);
    expect(sent.length).toBe(1);
    expect(text.includes('sent 1, skipped 1, failed 0, left 0')).toBe(true);
    const statuses = (await store.query((l) => l.id.startsWith('reengage:')))
      .map((l) => l.status)
      .sort();
    expect(statuses).toEqual(['sent', 'skipped']);
    // The next run does not offer either contact again.
    const again = await run({});
    expect(again.text.includes('0 personal contact(s)')).toBe(true);
  });
  it('interactive mode can switch the form, edit and quit', async () => {
    const store = await seed();
    const { run, sent } = cli(store, {
      answers: ['f', 'e', 'Свой\\nтекст', 'y', 'q'],
    });
    await run({ interactive: true, limit: '1' });
    expect(sent.length).toBe(1);
    expect(sent[0].text).toBe('Свой\nтекст');
  });
  it('a failed send keeps the draft and reports it', async () => {
    const { run } = cli(await seed(), {
      answers: ['y', 'q'],
      send: async () => {
        throw new Error('blocked');
      },
    });
    const { text } = await run({ interactive: true });
    expect(text.includes('not sent: blocked')).toBe(true);
    expect(text.includes('failed 1, left 2')).toBe(true);
  });
  it('batch mode needs --confirm=true', async () => {
    const { run, sent } = cli(await seed());
    const refused = await run({ mode: 'batch' });
    expect(refused.code).toBe(1);
    expect(sent.length).toBe(0);
    const ok = await run({ mode: 'batch', confirm: 'true' });
    expect(ok.code).toBe(0);
    expect(sent.length).toBe(2);
  });
  it('accepts custom templates, threshold and unknown-mode errors', async () => {
    const { run } = cli(await seed());
    const custom = await run({ informal: 'Йо\\nкак ты?', days: '150' });
    expect(custom.text.includes('1 personal contact(s)')).toBe(true);
    expect(custom.text.includes(defaultReengageTemplates.formal)).toBe(false);
    const bad = await run({ mode: 'yolo' });
    expect(bad.code).toBe(1);
    expect(bad.text.includes('unknown re-engage mode')).toBe(true);
  });
  it('is listed in the top-level help', async () => {
    const out = [];
    await runCli(['help'], { log: (m) => out.push(m) });
    expect(out.join('\n').includes('reengage')).toBe(true);
  });
});
