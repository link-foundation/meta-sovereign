import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Readable } from 'node:stream';
import { setImmediate } from 'node:timers/promises';
import { handleAutoImportRoutes } from '../src/server/routes-auto-import.js';
import { closeTelegramLogins } from '../src/server/telegram-login-registry.js';
import { writeFile } from 'node:fs/promises';
import { followSessionFixture } from './helpers/telegram-follow-session.mjs';
import {
  parseLegacyTelegramConfig,
  readLegacyTelegramConfig,
} from '../src/sources/telegram-legacy-config.js';
import { createTelegramLoginCommands } from '../src/cli/telegram-login-commands.js';
import {
  decodeWire,
  encodeLinoValue,
  LINO_TEXT,
  LINO_BINARY,
} from '../src/transport/lino.js';
import { startServer } from '../src/server/index.js';
import { createTelegramCreds } from '../src/sources/auto-import/telegram-creds.js';
import { createTelegramMtproto } from '../src/sources/telegram-mtproto.js';

const routeRequest = async (f, ctx, action, body) => {
  const req = Readable.from([Buffer.from(encodeLinoValue(body))]);
  req.method = 'POST';
  req.headers = { 'content-type': LINO_TEXT };
  const response = {};
  const res = {
    lino: { type: LINO_TEXT, jsonCompatibility: false },
    writeHead: (status) => {
      response.status = status;
    },
    end: (bytes) => {
      response.body = decodeWire(bytes);
    },
  };
  await handleAutoImportRoutes(
    f.store,
    req,
    res,
    `/api/auto-import/telegram/${action}`,
    ctx
  );
  return response;
};

test(
  'Follow env import reads literal aliases, quotes and comments without expansion',
  { timeout: 3000 },
  async () => {
    const f = await followSessionFixture();
    try {
      const text = f.original
        .replace('API_ID=2040', "API_ID='2040' # identifier")
        .replace('TELEGRAM_USER_SESSION=', 'export TELEGRAM_USER_SESSION=');
      const parsed = parseLegacyTelegramConfig(text);
      assert.equal(parsed.session, f.session);
      assert.equal(parsed.apiId, '2040');
      assert.equal(parsed.phone, '+15551234567');
      for (const bad of [
        `${text}TELEGRAM_API_ID=9999\n`,
        `${text}TELEGRAM_USER_SESSION="${'X'.repeat(50)}"\n`,
        text.replace(f.session, '$(run-a-command)'),
        text.replace('2040', '${OTHER_ID}'),
        text.replace('2040', '2040 trailing-garbage'),
        text.replace('0123456789abcdef0123456789abcdef', 'bad-hash'),
      ]) {
        assert.throws(() => parseLegacyTelegramConfig(bad), {
          code: 'SESSION_CONFIG',
        });
      }
      assert.equal(
        parseLegacyTelegramConfig(`${text}TELEGRAM_API_ID=2040\n`).apiId,
        '2040'
      );
      const phoneOnly = f.original.replace(f.session, '');
      assert.equal(
        parseLegacyTelegramConfig(phoneOnly, false).session,
        undefined
      );
      assert.throws(() => parseLegacyTelegramConfig(phoneOnly), {
        code: 'SESSION_CONFIG',
      });
    } finally {
      await f.close();
    }
  }
);

test(
  'legacy env files are bounded and valid UTF-8 before any connection',
  { timeout: 3000 },
  async () => {
    const f = await followSessionFixture();
    try {
      for (const data of [
        'A'.repeat(65_537),
        Buffer.from([0xff, 0xfe]),
        'SQLite format 3\0',
      ]) {
        await writeFile(f.file, data);
        await assert.rejects(() => readLegacyTelegramConfig(f.file), {
          code: 'SESSION_CONFIG',
        });
        assert.equal(f.state.clients.length, 0);
      }
      // Some platforms refuse opening a directory before fstat can run.
      await assert.rejects(() => readLegacyTelegramConfig(f.root));
    } finally {
      await f.close();
    }
  }
);

test(
  'CLI Follow env migration verifies identity and emits default Lino without modifying its source',
  { timeout: 3000 },
  async () => {
    const f = await followSessionFixture();
    let closed = false;
    f.store.close = async () => {
      closed = true;
    };
    const commands = createTelegramLoginCommands({
      openStore: async () => f.store,
      env: {},
      createMtproto: () => f.mtproto,
      ask: async () => {
        throw new Error('import must use its own saved credentials');
      },
    });
    const output = [];
    try {
      assert.equal(
        await commands['telegram-session-import'](
          { 'env-file': f.file },
          (line) => output.push(line)
        ),
        0
      );
      assert.deepEqual(decodeWire(output[0]), {
        ok: true,
        imported: true,
        account: { id: '7', username: 'follow_owner' },
      });
      assert.equal(
        (await f.store.get('secret:telegram:user-session')).value,
        f.session
      );
      assert.equal((await f.store.get('secret:telegram:api-id')).value, '2040');
      assert.ok(closed && f.state.clients.every((c) => c.closed));
      assert.ok(await f.unchanged());
      assert.ok(!output.join('').includes(f.session));
      assert.ok(!output.join('').includes('0123456789abcdef'));
      output.length = 0;
      assert.equal(
        await commands['telegram-session-import'](
          { 'env-file': f.file, json: true },
          (line) => output.push(line)
        ),
        0
      );
      assert.equal(JSON.parse(output[0]).ok, true);
    } finally {
      await f.close();
    }
  }
);

test(
  'finder rechecks a saved session before replacing credentials and masks every public phone',
  { timeout: 5000 },
  async () => {
    const f = await followSessionFixture();
    try {
      const scan = await f.creds.scan({ roots: [f.root] });
      const entry = scan.entries[0];
      assert.equal(entry.account.id, '7');
      assert.equal(entry.account.verified, true);
      f.state.refuse = true;
      await assert.rejects(() => f.creds.use(entry.id, { store: f.store }), {
        status: 503,
      });
      assert.equal(
        (await f.store.get('secret:telegram:user-session')).value,
        'previous-session'
      );
      f.state.refuse = false;
      f.state.id = '8';
      await assert.rejects(() => f.creds.use(entry.id, { store: f.store }), {
        status: 409,
      });
      f.state.id = '7';
      const used = await f.creds.use(entry.id, { store: f.store });
      assert.equal(used.ok, true);
      assert.equal(used.account.id, '7');
      assert.ok(!JSON.stringify(used).includes('15551234567'));
      assert.equal(
        (await f.store.get('secret:telegram:user-session')).value,
        f.session
      );
      assert.ok(await f.unchanged());
      assert.ok(f.state.clients.every((c) => c.closed));
    } finally {
      await f.close();
    }
  }
);

test(
  'finder masks the phone in both cached entry and group views',
  { timeout: 3000 },
  async () => {
    const f = await followSessionFixture();
    try {
      const scan = await f.creds.scan({ roots: [f.root] });
      assert.ok(!JSON.stringify(scan).includes('15551234567'));
      assert.ok(!JSON.stringify(scan).includes(f.session));
      assert.equal(scan.entries[0].account.phone, '••••4567');
    } finally {
      await f.close();
    }
  }
);

test(
  'Follow imports preserve a bot token in the same file and refuse unavailable verification',
  { timeout: 5000 },
  async () => {
    const f = await followSessionFixture();
    try {
      await writeFile(
        f.file,
        `${f.original}BOT_TOKEN=123456:${'A'.repeat(35)}\n`
      );
      const scan = await f.creds.scan({ roots: [f.root] });
      assert.deepEqual(scan.entries.map((e) => e.kind).sort(), [
        'bot-token',
        'user-session',
      ]);
      const unavailable = createTelegramCreds({
        dataDir: f.root,
        fetchImpl: null,
      });
      const id = scan.entries.find((e) => e.kind === 'user-session').id;
      await assert.rejects(() => unavailable.use(id, { store: f.store }), {
        status: 503,
      });
      assert.equal(
        (await f.store.get('secret:telegram:user-session')).value,
        'previous-session'
      );
    } finally {
      await f.close();
    }
  }
);

test(
  'CLI rejects revoked or non-user identity without replacing the stored session',
  { timeout: 5000 },
  async () => {
    const f = await followSessionFixture();
    try {
      const outputs = [];
      const commands = createTelegramLoginCommands({
        openStore: async () => f.store,
        env: {},
        createMtproto: () => f.mtproto,
      });
      f.state.refuse = true;
      assert.equal(
        await commands['telegram-session-import'](
          { 'env-file': f.file },
          (line) => outputs.push(decodeWire(line))
        ),
        1
      );
      assert.equal(outputs[0].ok, false);
      assert.ok(!JSON.stringify(outputs).includes('PRIVATE_SESSION_DETAIL'));
      assert.equal(
        (await f.store.get('secret:telegram:user-session')).value,
        'previous-session'
      );
      assert.ok(await f.unchanged());
      assert.ok(f.state.clients.every((c) => c.closed));
      for (const identity of [
        {},
        { id: '0' },
        { id: '1', bot: true },
        { id: '1', deleted: true },
      ]) {
        const client = {
          connect: async () => {},
          destroy: async () => {},
          getMe: async () => identity,
        };
        const mtproto = createTelegramMtproto({
          clientFactory: async () => client,
        });
        await assert.rejects(
          () =>
            mtproto.identify({
              apiId: '2040',
              apiHash: '0123456789abcdef0123456789abcdef',
              session: f.session,
            }),
          { code: 'LOGIN_IDENTITY' }
        );
      }
    } finally {
      await f.close();
    }
  }
);

test(
  'actual Lino finder API verifies Follow config, retains a failed connection and imports after recovery',
  { timeout: 10000 },
  async () => {
    const f = await followSessionFixture();
    const handle = await startServer({
      store: f.store,
      storeDir: f.root,
      port: 0,
      enableSync: false,
      enableHandlers: false,
      telegramCreds: f.creds,
      telegramMtproto: f.mtproto,
      telegramAccount: f.account,
      automations: { scheduler: false },
    });
    const post = async (action, body, type) => {
      const res = await fetch(
        `http://127.0.0.1:${handle.port}/api/auto-import/telegram/${action}`,
        {
          method: 'POST',
          headers: { 'content-type': type, accept: type },
          body: encodeLinoValue(body, type),
        }
      );
      return {
        status: res.status,
        body: decodeWire(new Uint8Array(await res.arrayBuffer()), type),
      };
    };
    try {
      for (const type of [LINO_TEXT, LINO_BINARY]) {
        await f.store.put({
          id: 'secret:telegram:user-session',
          value: 'previous-session',
        });
        const scan = await post('scan', { roots: [f.root] }, type);
        assert.equal(scan.status, 200);
        f.state.refuse = true;
        const failed = await post('use', { id: scan.body.entries[0].id }, type);
        assert.equal(failed.status, 503);
        assert.ok(!JSON.stringify(failed).includes('PRIVATE_SESSION_DETAIL'));
        assert.equal(
          (await f.store.get('secret:telegram:user-session')).value,
          'previous-session'
        );
        f.state.refuse = false;
        const used = await post('use', { id: scan.body.entries[0].id }, type);
        assert.equal(used.body.ok, true);
        assert.equal(used.body.account.id, '7');
        assert.equal(
          (await f.store.get('secret:telegram:user-session')).value,
          f.session
        );
      }
      assert.ok(await f.unchanged());
      assert.ok(f.state.clients.every((c) => c.closed));
    } finally {
      await handle.close();
      await f.close();
    }
  }
);

test(
  'default finder route owns verification through shutdown and refuses new imports while closing',
  { timeout: 5000 },
  async () => {
    const f = await followSessionFixture();
    const ctx = {
      storeDir: f.root,
      telegramMtproto: f.mtproto,
      allowOrigins: [],
    };
    let release;
    let entered;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const started = new Promise((resolve) => {
      entered = resolve;
    });
    let closing;
    let importing;
    try {
      const scan = await routeRequest(f, ctx, 'scan', { roots: [f.root] });
      assert.equal(scan.status, 200);
      const id = scan.body.entries[0].id;
      f.state.beforeMe = async () => {
        entered();
        await gate;
      };
      importing = routeRequest(f, ctx, 'use', { id });
      await started;
      let stopped = false;
      closing = closeTelegramLogins(ctx).then(() => {
        stopped = true;
      });
      await setImmediate();
      assert.equal(stopped, false);
      assert.equal(
        (await f.store.get('secret:telegram:user-session')).value,
        'previous-session'
      );
      assert.equal((await routeRequest(f, ctx, 'use', { id })).status, 409);
      release();
      assert.equal((await importing).body.ok, true);
      await closing;
      assert.ok(f.state.clients.every((c) => c.closed));
      assert.equal(ctx.telegramLoginStarts.size, 0);
      assert.ok(await f.unchanged());
    } finally {
      release();
      await importing;
      await closing;
      await f.close();
    }
  }
);

test(
  'finder phone migration keeps a pending login factory owned during shutdown',
  { timeout: 3000 },
  async () => {
    const f = await followSessionFixture();
    let release;
    let entered;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const started = new Promise((resolve) => {
      entered = resolve;
    });
    let cancelled = 0;
    const ctx = {
      storeDir: f.root,
      allowOrigins: [],
      telegramCreds: {
        use: async () => ({ needsLogin: true }),
        loginContext: async () => ({
          apiId: 2040,
          apiHash: 'hash',
          phone: '+15551234567',
        }),
      },
      telegramMtproto: {
        createLogin: async () => {
          entered();
          await gate;
          return {
            ready: async () => 'code',
            state: 'code',
            cancel: async () => {
              cancelled++;
            },
          };
        },
      },
    };
    let closing;
    let importing;
    try {
      importing = routeRequest(f, ctx, 'use', { id: 'phone' });
      await started;
      let stopped = false;
      closing = closeTelegramLogins(ctx).then(() => {
        stopped = true;
      });
      await setImmediate();
      assert.equal(stopped, false);
      release();
      assert.equal((await importing).status, 409);
      await closing;
      assert.equal(cancelled, 1);
      assert.equal(
        (await f.store.get('secret:telegram:user-session')).value,
        'previous-session'
      );
    } finally {
      release();
      await importing;
      await closing;
      await f.close();
    }
  }
);
