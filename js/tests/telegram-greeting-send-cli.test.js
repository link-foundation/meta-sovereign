import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTelegramGreetingCommands } from '../src/cli/telegram-greetings-commands.js';
import {
  greetingSendFixture,
  greetingGate,
} from './helpers/greeting-send-fakes.mjs';

const commandsFor = (f) => {
  const closed = [];
  const commands = createTelegramGreetingCommands({
    openStore: async () => ({ close: async () => closed.push('store') }),
    createAccount: () => ({
      ...f.actions,
      stop: async () => {
        await f.env.greetingSendStop();
        closed.push('account');
      },
    }),
  });
  return { commands, closed };
};
test('CLI bot start and greeting commands preview by default and send only with explicit confirmation', async () => {
  for (const [command, chat] of [
    ['telegram-bot-start', '@GreetingBot'],
    ['telegram-greet', '@GreetingUser'],
  ]) {
    for (const confirm of [undefined, false, 'false', 'true']) {
      const f = await greetingSendFixture();
      const { commands, closed } = commandsFor(f);
      const logs = [];
      const result = await commands[command]({ chat, confirm }, (line) =>
        logs.push(JSON.parse(line))
      );
      assert.equal(result, 0);
      assert.equal(f.sends().length, confirm === 'true' ? 1 : 0);
      assert.equal(logs[0].ok, true);
      assert.deepEqual(closed, ['account', 'store']);
    }
  }
});
test('CLI rejects invalid flags before opening storage and does not claim skipped or uncertain sends succeeded', async () => {
  const commands = createTelegramGreetingCommands({
    openStore: () => assert.fail('invalid request opened storage'),
  });
  for (const args of [
    { chat: '@GreetingUser', confirm: 'yes' },
    { chat: 'two words' },
    { chat: '@GreetingBot', sticker: '11' },
  ]) {
    assert.equal(await commands['telegram-bot-start'](args, () => {}), 1);
  }
  const f = await greetingSendFixture();
  f.client.invoke = async (request) => {
    f.calls.push(request);
    return { updates: [] };
  };
  const logs = [];
  assert.equal(
    await commandsFor(f).commands['telegram-greet'](
      { chat: '@GreetingUser', confirm: true },
      (line) => logs.push(JSON.parse(line))
    ),
    1
  );
  assert.equal(logs[0].status, 'unknown');
  assert.equal(f.sends().length, 1);
});
test('SIGINT during preview cancels it without sending, removes signal listeners, and awaits account cleanup', async () => {
  const f = await greetingSendFixture();
  const entered = greetingGate();
  const gate = greetingGate();
  f.context.userClient = async () => {
    entered.resolve();
    return gate.promise;
  };
  const before = process.listenerCount('SIGINT');
  const { commands, closed } = commandsFor(f);
  const logs = [];
  const pending = commands['telegram-greet'](
    { chat: '@GreetingUser', confirm: true },
    (line) => logs.push(JSON.parse(line))
  );
  try {
    await entered.promise;
    process.emit('SIGINT');
  } finally {
    gate.resolve(f.client);
  }
  assert.equal(await pending, 1);
  assert.equal(logs[0].code, 'cancelled');
  assert.equal(f.sends().length, 0);
  assert.deepEqual(closed, ['account', 'store']);
  assert.equal(process.listenerCount('SIGINT'), before);
});
