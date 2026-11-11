import test from 'node:test';
import assert from 'node:assert/strict';
import { questionBrowserApi } from '../src/web/question-browser-api.js';
import { questionWatchCommand } from '../src/cli/question-watch-commands.js';
import { createAutomationCommands } from '../src/cli/automation-commands.js';
import { startServer } from '../src/server/index.js';
import {
  LINO_TEXT,
  LINO_BINARY,
  encodeWire,
  readWireResponse,
  decodeWire,
} from '../src/transport/lino.js';
import { questionWatchFixture } from '../../experiments/issue-56/question-watch-fixture.mjs';

test('watch API writes once and recovers only by the same request ID', async () => {
  const env = await questionWatchFixture();
  try {
    let result = await env.browser.watchStart(env.input);
    const calls = [];
    const api = questionBrowserApi({
      remote: {
        get: async () => env.browser.capabilities(),
        report: async (...args) => {
          calls.push(args);
          return result;
        },
      },
    });
    assert.equal(
      (await api.browserAnswerCapabilities()).watchSources[0].id,
      'hh'
    );
    await api.startBrowserAnswerWatch(env.input);
    assert.deepEqual(calls.at(-1)[2], { network: true, read: false });
    result = await env.until((s) => s.phase === 'sent');
    await api.browserAnswerWatchStatus(env.input);
    assert.deepEqual(calls.at(-1)[2], { network: true, read: true });
    const sent = result;
    result = {
      ...sent,
      id: 'question-watch:00000000-0000-0000-0000-000000000000',
    };
    await assert.rejects(api.browserAnswerWatchStatus(env.input));
    result = { ...sent, outbox: { ...sent.outbox, receipt: undefined } };
    await assert.rejects(api.browserAnswerWatchStatus(env.input), {
      code: 'send-unknown',
    });
    result = await env.browser.watchStop(env.input);
    assert.equal((await api.stopBrowserAnswerWatch(env.input)).owned, false);
    assert.deepEqual(calls.at(-1)[2], { network: true, read: false });
    assert.equal(env.state.opens, 1);
    assert.equal(env.state.sends.length, 1);
  } finally {
    await env.browser.close();
  }
});

test('foreground CLI cancellation drains and removes both signal handlers', async () => {
  const env = await questionWatchFixture();
  const before = ['SIGINT', 'SIGTERM'].map((signal) =>
    process.listenerCount(signal)
  );
  try {
    const result = await questionWatchCommand(
      { id: env.review.id, confirm: 'true', 'watch-id': env.input.id },
      env.browser,
      () => process.emit('SIGINT')
    );
    assert.equal(result.state, 'stopped');
    assert.equal(result.owned, false);
    assert.equal(env.state.closes, 1);
    assert.deepEqual(
      ['SIGINT', 'SIGTERM'].map((signal) => process.listenerCount(signal)),
      before
    );
  } finally {
    await env.browser.close();
  }
});

test('the CLI command routes confirmed foreground ownership and emits Lino recovery state', async () => {
  const env = await questionWatchFixture();
  const cli = createAutomationCommands({
    openStore: async () => env.store,
    send: env.send,
  });
  const output = [];
  try {
    const code = await cli.automations(
      {
        _: ['answers', 'browser', 'watch'],
        id: env.review.id,
        confirm: 'true',
        'watch-id': env.input.id,
        'duration-ms': '1000',
        now: env.state.now.toISOString(),
      },
      (line) => {
        output.push(line);
        if (output.length === 1) {
          process.emit('SIGINT');
        }
      }
    );
    assert.equal(code, 0, output.join('\n'));
    assert.equal(decodeWire(output[0]).id, env.input.id);
    const last = decodeWire(output.at(-1));
    assert.equal(last.state, 'stopped');
    assert.equal(last.owned, false);
    assert.equal(env.state.opens, 1);
    assert.equal(env.state.closes, 1);
  } finally {
    await env.browser.close();
  }
});

test(
  'text/binary Lino watch routes retain the start ID, protect origins and stop the owned provider',
  { timeout: 15000 },
  async () => {
    const env = await questionWatchFixture();
    const server = await startServer({
      store: env.store,
      port: 0,
      localUi: false,
      enableSync: false,
      enableHandlers: false,
      telegramAccount: false,
      automations: { scheduler: false, send: env.send },
      log: null,
    });
    const call = async (action, input, type = LINO_TEXT, headers = {}) => {
      const response = await fetch(
        `http://127.0.0.1:${server.port}/api/automations/answers/browser/${action}`,
        {
          method: 'POST',
          headers: { accept: type, 'content-type': type, ...headers },
          body: encodeWire(input, type),
        }
      );
      return {
        status: response.status,
        body: await readWireResponse(response),
      };
    };
    try {
      const review = await call('inspect', {
        source: 'hh',
        chat: 'https://hh.ru/chat/7',
      });
      assert.equal(review.status, 200);
      env.input.review = review.body.id;
      const denied = await call('watch-start', env.input, LINO_TEXT, {
        origin: 'https://untrusted.test',
      });
      assert.equal(denied.status, 403);
      assert.equal(env.state.opens, 0);
      assert.equal(
        (await call('watch-start', { ...env.input, confirm: false })).body.code,
        'question-watch-confirm-required'
      );
      const start = await call('watch-start', env.input, LINO_BINARY);
      assert.equal(start.status, 200);
      assert.equal(start.body.id, env.input.id);
      assert.equal(
        (await call('watch-start', env.input)).body.id,
        env.input.id
      );
      assert.equal((await call('watch-status', env.input)).body.owned, true);
      const stopped = await call('watch-stop', env.input, LINO_BINARY);
      assert.equal(stopped.body.state, 'stopped');
      assert.equal(stopped.body.owned, false);
      assert.equal(env.state.opens, 1);
      assert.equal(env.state.closes, 1);
      assert.equal((await call('watch-status', env.input)).body.owned, false);
    } finally {
      await server.close();
      await env.browser.close();
    }
  }
);
