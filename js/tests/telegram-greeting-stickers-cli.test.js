import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createTelegramGreetingCommands,
  greetingCatalogRequest,
} from '../src/cli/telegram-greetings-commands.js';
import { greetingStickerFixture } from './helpers/greeting-stickers-fakes.mjs';

test('catalog CLI validates bounds and never opens storage for invalid inputs', async () => {
  for (const args of [
    { refresh: 'yes' },
    { 'greetings-only': 'yes' },
    { limit: '0' },
    { offset: '-1' },
    { 'max-sets': '0' },
    { 'max-documents': '50001' },
  ]) {
    assert.equal(greetingCatalogRequest(args), null);
  }
  let opened = false;
  const commands = createTelegramGreetingCommands({
    openStore: async () => {
      opened = true;
    },
  });
  assert.equal(
    await commands['telegram-greeting-stickers']({ refresh: 'bad' }, () => {}),
    1
  );
  assert.equal(opened, false);
});

test('catalog CLI reads without refreshing and closes the account before storage', async () => {
  const events = [];
  const output = [];
  const fixture = greetingStickerFixture();
  const commands = createTelegramGreetingCommands({
    openStore: async () => ({ close: async () => events.push('close') }),
    createAccount: () => ({
      ...fixture.catalog,
      stop: async () => {
        await fixture.env.greetingStickersStop();
        events.push('stop');
      },
    }),
  });
  assert.equal(
    await commands['telegram-greeting-stickers']({}, (line) =>
      output.push(line)
    ),
    0
  );
  assert.equal(JSON.parse(output[0]).cache.total, 0);
  assert.equal(fixture.calls.length, 0);
  assert.deepEqual(events, ['stop', 'close']);
});

test('catalog CLI waits for explicit refresh and reports incomplete coverage as nonzero', async () => {
  for (const maxSets of ['1000', '1']) {
    const fixture = greetingStickerFixture();
    const output = [];
    let closed = false;
    const commands = createTelegramGreetingCommands({
      openStore: async () => ({
        close: async () => {
          closed = true;
        },
      }),
      createAccount: () => ({
        ...fixture.catalog,
        stop: fixture.env.greetingStickersStop,
      }),
      sleep: async () =>
        new Promise((resolve) => globalThis.setImmediate(resolve)),
    });
    const code = await commands['telegram-greeting-stickers'](
      { refresh: 'true', 'max-sets': maxSets },
      (line) => output.push(line)
    );
    assert.equal(code, maxSets === '1' ? 1 : 0);
    assert.equal(
      JSON.parse(output[0]).job.state,
      maxSets === '1' ? 'partial' : 'done'
    );
    assert.equal(closed, true);
    assert.equal(
      fixture.calls.some((call) => call.className === 'SendMedia'),
      false
    );
  }
});

// Deno's Node compatibility layer ignores SIGTERM listeners on Windows.
// Exercise the terminal's supported Ctrl+C there; POSIX also checks SIGTERM.
const interruptSignals =
  process.platform === 'win32' ? ['SIGINT'] : ['SIGINT', 'SIGTERM'];
for (const signal of interruptSignals) {
  test(`${signal} cancels a catalog refresh and awaits cleanup with a nonzero exit`, async () => {
    const events = [];
    const output = [];
    const commands = createTelegramGreetingCommands({
      openStore: async () => ({ close: async () => events.push('close') }),
      createAccount: () => ({
        greetingStickersRefresh: async () => {
          process.emit(signal);
          return { ok: true, job: { id: 'job' } };
        },
        greetingStickersCancel: async () => events.push('cancel'),
        greetingStickersStatus: async () => ({
          ok: true,
          job: { id: 'job', state: 'cancelled' },
        }),
        stop: async () => events.push('stop'),
      }),
    });
    assert.equal(
      await commands['telegram-greeting-stickers']({ refresh: true }, (line) =>
        output.push(line)
      ),
      1
    );
    assert.ok(events.includes('cancel'));
    assert.deepEqual(events.slice(-2), ['stop', 'close']);
    assert.equal(JSON.parse(output[0]).job.state, 'cancelled');
  });
}

test('catalog CLI retains cleanup when reading status fails', async () => {
  const events = [];
  const commands = createTelegramGreetingCommands({
    openStore: async () => ({ close: async () => events.push('close') }),
    createAccount: () => ({
      greetingStickersStatus: async () => {
        throw new Error('offline');
      },
      stop: async () => events.push('stop'),
    }),
  });
  await assert.rejects(
    commands['telegram-greeting-stickers']({}, () => {}),
    /offline/
  );
  assert.deepEqual(events, ['stop', 'close']);
});
