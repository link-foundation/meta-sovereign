import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createMemoryStore } from '../src/storage/universal.js';
import { createTelegramMtproto } from '../src/sources/telegram-mtproto.js';
import { readTelegramCredentials } from '../src/sources/telegram-account.js';
import { createTelegramLoginCommands } from '../src/cli/telegram-login-commands.js';
import { askTerminalSecret } from '../src/cli/secret-prompt.js';
import { PassThrough, Writable } from 'node:stream';

const HASH = '0123456789abcdef0123456789abcdef';
const SESSION = `1${'Ab9Zx'.repeat(14)}`;
const environment = {
  TELEGRAM_API_ID: '2040',
  TELEGRAM_API_HASH: HASH,
  TELEGRAM_PHONE: '+15551234567',
};
const fakeClient = (events, extra = {}) => ({
  async connect() {
    events.push('connect');
  },
  async destroy() {
    events.push('destroy');
  },
  async getMe() {
    return { id: 7n, username: 'tester', phone: environment.TELEGRAM_PHONE };
  },
  session: { save: () => SESSION },
  async start({ phoneCode, password, onError }) {
    for (const [ask, accept, code] of [
      [phoneCode, 'right-code', 'PHONE_CODE_INVALID'],
      [password, 'right-password', 'PASSWORD_HASH_INVALID'],
    ]) {
      for (let i = 0; i < 3; i++) {
        const value = await ask();
        if (value === accept) {
          break;
        }
        if ((await onError(new Error(code))) || i === 2) {
          throw new Error('AUTH_USER_CANCEL');
        }
      }
    }
  },
  ...extra,
});
const setup = (options = {}) => {
  const events = [];
  const store = createMemoryStore();
  store.close = async () => {
    events.push('store-close');
  };
  const lines = [];
  let built = 0;
  const client = fakeClient(events, options.client);
  const commands = createTelegramLoginCommands({
    openStore: async () => store,
    env: environment,
    createMtproto: () =>
      createTelegramMtproto({
        clientFactory: async () => {
          built++;
          return client;
        },
      }),
    ...options,
  });
  return {
    commands,
    store,
    events,
    lines,
    log: (line) => lines.push(JSON.parse(line)),
    builds: () => built,
  };
};

test(
  'CLI phone/2FA retries save a reusable session and close before store release',
  { timeout: 3000 },
  async () => {
    const answers = [
      'wrong-code',
      'right-code',
      'wrong-password',
      'right-password',
    ];
    const prompts = [];
    const fixture = setup({
      ask: async (label) => {
        prompts.push(label);
        return answers.shift();
      },
    });
    assert.equal(await fixture.commands['telegram-login']({}, fixture.log), 0);
    assert.equal(prompts.length, 4);
    assert.deepEqual(
      fixture.lines.map((line) => line.code ?? line.ok),
      ['PHONE_CODE_INVALID', 'PASSWORD_HASH_INVALID', true]
    );
    assert.deepEqual(fixture.lines.at(-1).account, {
      id: '7',
      username: 'tester',
    });
    const saved = await readTelegramCredentials(fixture.store);
    assert.equal(saved.session, SESSION);
    assert.equal(saved.apiHash, HASH);
    assert.deepEqual(fixture.events, ['destroy', 'store-close']);
    const output = JSON.stringify(fixture.lines);
    for (const secret of [
      SESSION,
      HASH,
      environment.TELEGRAM_PHONE,
      'wrong-code',
      'right-password',
    ]) {
      assert.ok(!output.includes(secret), 'private value leaked');
    }
  }
);

test(
  'CLI cancellation aborts masked input, closes the client and preserves saved credentials',
  { timeout: 3000 },
  async () => {
    const listeners = [
      process.listenerCount('SIGINT'),
      process.listenerCount('SIGTERM'),
    ];
    const fixture = setup({
      ask: async (_label, { signal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), {
            once: true,
          });
          globalThis.queueMicrotask(() => process.emit('SIGINT'));
        }),
    });
    await fixture.store.put({
      id: 'secret:telegram:user-session',
      value: 'old-session',
    });
    assert.equal(await fixture.commands['telegram-login']({}, fixture.log), 1);
    assert.deepEqual(fixture.lines, [{ ok: false, code: 'LOGIN_CANCELLED' }]);
    assert.deepEqual(fixture.events, ['destroy', 'store-close']);
    assert.equal(
      (await readTelegramCredentials(fixture.store)).session,
      'old-session'
    );
    assert.deepEqual(
      [process.listenerCount('SIGINT'), process.listenerCount('SIGTERM')],
      listeners
    );
  }
);

test(
  'legacy CLI import verifies the account, retains source bytes and stores no raw output',
  { timeout: 3000 },
  async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-tg-cli-session-'));
    const file = path.join(dir, '.telegram_session');
    const original = ` ${SESSION}\n`;
    await writeFile(file, original, { mode: 0o600 });
    const fixture = setup({
      ask: async () => {
        throw new Error('unexpected prompt');
      },
    });
    try {
      assert.equal(
        await fixture.commands['telegram-session-import'](
          { file },
          fixture.log
        ),
        0
      );
      assert.deepEqual(fixture.events, ['connect', 'destroy', 'store-close']);
      assert.equal(
        (await readTelegramCredentials(fixture.store)).session,
        SESSION
      );
      assert.equal(await readFile(file, 'utf8'), original);
      assert.deepEqual(fixture.lines, [
        { ok: true, imported: true, account: { id: '7', username: 'tester' } },
      ]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
);

test(
  'legacy CLI import rejects invalid, binary and oversized files before connecting',
  { timeout: 3000 },
  async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-tg-cli-invalid-'));
    const file = path.join(dir, '.telegram_session');
    try {
      for (const text of [
        '<html>not a session</html>',
        'SQLite format 3\0binary',
        'A'.repeat(65_537),
      ]) {
        await writeFile(file, text);
        const fixture = setup();
        assert.equal(
          await fixture.commands['telegram-session-import'](
            { file },
            fixture.log
          ),
          1
        );
        assert.equal(fixture.builds(), 0);
        assert.equal(await readTelegramCredentials(fixture.store), null);
        assert.deepEqual(fixture.lines, [{ ok: false, code: 'SESSION_FILE' }]);
        assert.deepEqual(fixture.events, ['store-close']);
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
);

test(
  'failed legacy verification closes without replacing an existing session or exposing an error secret',
  { timeout: 3000 },
  async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-tg-cli-refused-'));
    const file = path.join(dir, '.telegram_session');
    await writeFile(file, SESSION);
    const fixture = setup({
      client: {
        getMe: async () => {
          throw new Error('SECRETPASSWORD');
        },
      },
    });
    await fixture.store.put({
      id: 'secret:telegram:user-session',
      value: 'old-session',
    });
    try {
      assert.equal(
        await fixture.commands['telegram-session-import'](
          { file },
          fixture.log
        ),
        1
      );
      assert.deepEqual(fixture.lines, [{ ok: false, code: 'LOGIN_FAILED' }]);
      assert.deepEqual(fixture.events, ['connect', 'destroy', 'store-close']);
      assert.equal(
        (await readTelegramCredentials(fixture.store)).session,
        'old-session'
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
);

test(
  'CLI rejects secret command-line arguments and nonterminal prompts',
  { timeout: 1000 },
  async () => {
    for (const key of ['api-hash', 'phone', 'code', 'password', 'session']) {
      const fixture = setup();
      assert.equal(
        await fixture.commands['telegram-login'](
          { [key]: 'private' },
          fixture.log
        ),
        1
      );
      assert.deepEqual(fixture.lines, [{ ok: false, code: 'BAD_REQUEST' }]);
      assert.deepEqual(fixture.events, []);
    }
    await assert.rejects(
      () => askTerminalSecret('Code', { input: { isTTY: false } }),
      { code: 'NEEDS_TERMINAL' }
    );
  }
);

test(
  'terminal input stays hidden and Ctrl+C/EOF settle pending prompts',
  { timeout: 2000 },
  async () => {
    for (const action of ['answer', 'interrupt', 'eof']) {
      const input = new PassThrough();
      input.isTTY = true;
      let raw = false;
      input.setRawMode = (value) => {
        raw = value;
      };
      let displayed = '';
      const output = new Writable({
        write(chunk, _encoding, done) {
          displayed += chunk.toString();
          done();
        },
      });
      const answer = askTerminalSecret('Private value', { input, output });
      input.write('synthetic-private-value');
      if (action === 'answer') {
        input.write('\r');
        assert.equal(await answer, 'synthetic-private-value');
      } else {
        if (action === 'interrupt') {
          input.write('\x03');
        } else {
          input.end();
        }
        await assert.rejects(answer, {
          code: action === 'interrupt' ? 'LOGIN_CANCELLED' : 'TERMINAL_CLOSED',
        });
      }
      assert.equal(displayed, 'Private value: \n');
      assert.equal(raw, false);
      input.destroy();
      output.end();
    }
  }
);
