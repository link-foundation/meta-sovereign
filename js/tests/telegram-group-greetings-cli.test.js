import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTelegramGreetingCommands } from '../src/cli/telegram-greetings-commands.js';
import { groupGreetingFixture } from './helpers/group-greeting-fakes.mjs';
import { greetingGate } from './helpers/greeting-send-fakes.mjs';

const commandFor = (f) => {
  const closed = [];
  const commands = createTelegramGreetingCommands({
    openStore: async () => ({ close: async () => closed.push('store') }),
    sleep: () => new Promise((resolve) => globalThis.setImmediate(resolve)),
    createAccount: () => ({
      ...f.account,
      stop: async () => {
        await f.env.chatUsersStop();
        closed.push('account');
      },
    }),
  });
  return { run: commands['telegram-greet-group'], closed };
};
test('group CLI scans and previews by default; explicit confirmation sends only the reviewed limit', async () => {
  for (const confirm of [undefined, 'false', 'true']) {
    const f = await groupGreetingFixture();
    const { run, closed } = commandFor(f);
    const logs = [];
    const exit = await run(
      { chat: '@GreetingGroup', limit: '1', sticker: '11', confirm },
      (line) => logs.push(JSON.parse(line))
    );
    assert.equal(exit, 0);
    assert.equal(logs[0].applied, confirm === 'true');
    assert.equal(f.sends().length, confirm === 'true' ? 1 : 0);
    assert.equal(logs[0].preview.selected, 1);
    assert.deepEqual(closed, ['account', 'store']);
  }
});
test('group CLI rejects invalid inputs before storage and returns nonzero for uncertain delivery', async () => {
  const commands = createTelegramGreetingCommands({
    openStore: () => assert.fail('invalid input opened storage'),
  });
  for (const body of [
    { chat: 'two words' },
    { chat: '-44', confirm: 'yes' },
    { chat: '-44', limit: '-1' },
    { chat: '-44', 'delay-ms': 'NaN' },
  ]) {
    assert.equal(await commands['telegram-greet-group'](body, () => {}), 1);
  }
  const f = await groupGreetingFixture();
  const invoke = f.client.invoke;
  f.client.invoke = async (request) => {
    if (request.className !== 'SendMedia') {
      return invoke(request);
    }
    f.calls.push(request);
    return { updates: [] };
  };
  const logs = [];
  assert.equal(
    await commandFor(f).run({ chat: '-44', confirm: true }, (line) =>
      logs.push(JSON.parse(line))
    ),
    1
  );
  assert.equal(logs[0].job.state, 'partial');
  assert.equal(f.sends().length, 1);
});
test('SIGINT during group preflight cancels without sending and awaits cleanup', async () => {
  const f = await groupGreetingFixture();
  const entered = greetingGate();
  const release = greetingGate();
  f.context.userClient = async () => {
    entered.resolve();
    return release.promise;
  };
  const before = process.listenerCount('SIGINT');
  const { run, closed } = commandFor(f);
  const logs = [];
  const pending = run({ chat: '-44', confirm: true }, (line) =>
    logs.push(JSON.parse(line))
  );
  try {
    await entered.promise;
    process.emit('SIGINT');
  } finally {
    release.resolve(f.client);
  }
  assert.equal(await pending, 1);
  assert.equal(logs[0].code, 'cancelled');
  assert.equal(f.sends().length, 0);
  assert.deepEqual(closed, ['account', 'store']);
  assert.equal(process.listenerCount('SIGINT'), before);
});
