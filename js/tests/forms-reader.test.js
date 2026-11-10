import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createFormReader,
  formUrl,
  inspectFormSession,
} from '../src/forms/reader.js';
import { createFormsCommands } from '../src/cli/forms-commands.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { startServer } from '../src/server/index.js';
import {
  LINO_TEXT,
  LINO_BINARY,
  encodeWire,
  readWireResponse,
} from '../src/transport/lino.js';
import { isReadRequest } from '../src/web/request-policy.js';

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const snapshot = () => ({
  url: 'https://example.test/form',
  documentTime: 1,
  title: 'Fixture',
  fields: [],
  excluded: 0,
  reasons: [],
  scope: 'visible-current-document',
});
const session = () => {
  const calls = [];
  return {
    calls,
    policy: { headless: false },
    commander: {
      async goto(options) {
        calls.push(['goto', options]);
      },
      async evaluate({ fn }) {
        calls.push(['read', fn.name]);
        return snapshot();
      },
    },
    async close() {
      calls.push(['close']);
    },
  };
};
const available = async () => ({ available: true, missing: [], reason: null });

test('form URLs reject scripts, local files, relative paths and embedded credentials before launch', async () => {
  let opened = 0;
  const reader = createFormReader({
    openSession: async () => {
      opened++;
    },
  });
  const credentialUrl = new URL('https://example.test');
  credentialUrl.username = 'synthetic-user';
  credentialUrl.password = 'synthetic-password';
  for (const url of [
    'javascript:alert(1)',
    'file:///tmp/private',
    '/form',
    credentialUrl.href,
    'bad',
  ]) {
    await assert.rejects(reader.read({ url }), { code: 'form-url' });
  }
  assert.equal(opened, 0);
  assert.equal(formUrl('https://example.test'), 'https://example.test/');
});

test('one owned read uses the Forms policy and always closes its session', async () => {
  const browser = session();
  let options;
  const reader = createFormReader({
    openSession: async (value) => {
      options = value;
      return browser;
    },
    availability: available,
  });
  const report = await reader.read({
    url: snapshot().url,
    browserSlot: 'application-2',
  });
  assert.equal(options.useCase, 'forms');
  assert.equal(options.slot, 'application-2');
  assert.equal(options.headless, undefined);
  assert.equal(report.mode, 'read-only');
  assert.equal(report.targetLifetime, 'snapshot-only');
  assert.equal(report.coverage, 'inspected');
  assert.deepEqual(
    browser.calls.map(([name]) => name),
    ['goto', 'read', 'read', 'close']
  );
  assert.equal((await reader.capabilities()).submit, false);
  await reader.stop();
  await assert.rejects(reader.read({ url: snapshot().url }), {
    code: 'form-stopped',
  });
});

test('concurrent inspections are refused and shutdown owns a pending launch', async () => {
  const pending = deferred();
  const browser = session();
  const reader = createFormReader({ openSession: () => pending.promise });
  const read = reader.read({ url: snapshot().url });
  const refused = assert.rejects(read, { code: 'form-stopped' });
  await assert.rejects(reader.read({ url: snapshot().url }), {
    code: 'form-busy',
  });
  let stopped = false;
  const stop = reader.stop().then(() => {
    stopped = true;
  });
  await Promise.resolve();
  assert.equal(stopped, false);
  pending.resolve(browser);
  await Promise.all([stop, refused]);
  assert.deepEqual(browser.calls, [['close']]);
});

test('shutdown closes an in-flight document read once and waits for its acknowledgement', async () => {
  const started = deferred();
  const done = deferred();
  const browser = session();
  browser.commander.evaluate = async () => {
    started.resolve();
    await done.promise;
    return snapshot();
  };
  const reader = createFormReader({ openSession: async () => browser });
  const read = assert.rejects(reader.read({ url: snapshot().url }), {
    code: 'form-stopped',
  });
  await started.promise;
  let stopped = false;
  const stopping = reader.stop().then(() => {
    stopped = true;
  });
  await Promise.resolve();
  assert.equal(stopped, false);
  done.resolve();
  await Promise.all([read, stopping]);
  assert.equal(browser.calls.filter(([name]) => name === 'close').length, 1);
});

test(
  'finite inspection deadline closes its browser and returns an explicit refusal',
  { timeout: 2000 },
  async () => {
    const browser = session();
    const done = deferred();
    browser.commander.evaluate = async () => {
      await done.promise;
      throw new Error('closed');
    };
    browser.close = async () => {
      browser.calls.push(['close']);
      done.resolve();
    };
    const reader = createFormReader({
      openSession: async () => browser,
      deadlineMs: 20,
    });
    await assert.rejects(reader.read({ url: snapshot().url }), {
      code: 'form-timeout',
    });
    assert.equal(browser.calls.filter(([name]) => name === 'close').length, 1);
  }
);

test('navigation during a snapshot is refused and failed reads release the slot', async () => {
  const browser = session();
  let calls = 0;
  browser.commander.evaluate = async () => ({
    ...snapshot(),
    documentTime: ++calls,
  });
  const reader = createFormReader({ openSession: async () => browser });
  await assert.rejects(reader.read({ url: snapshot().url }), {
    code: 'form-changed',
  });
  await assert.rejects(reader.read({ url: snapshot().url }), {
    code: 'form-changed',
  });
  assert.equal(browser.calls.filter(([name]) => name === 'close').length, 2);
});

test('an unreadable child is partial, while a detached captured child invalidates the snapshot', async () => {
  const browser = session();
  const main = { evaluate: async () => snapshot() };
  const child = {
    parentFrame: () => main,
    frameElement: async () => {
      throw new Error('gone');
    },
  };
  browser.page = { mainFrame: () => main, frames: () => [main, child] };
  const partial = await inspectFormSession(browser, { url: snapshot().url });
  assert.equal(partial.coverage, 'partial');
  assert.deepEqual(partial.omissions, [{ reason: 'frame-unavailable' }]);
  child.frameElement = async () => ({
    evaluate: async () => true,
    dispose: async () => {},
  });
  let reads = 0;
  child.evaluate = async () => {
    if (++reads > 1) {
      throw new Error('detached');
    }
    return snapshot();
  };
  await assert.rejects(inspectFormSession(browser, { url: snapshot().url }), {
    code: 'form-changed',
  });
});

test('optional inspection tracing identifies changed documents without recording field answers', async () => {
  const browser = session();
  const events = [];
  browser.trace = (event) => events.push(event);
  const main = {
    evaluate: async () => ({ ...snapshot(), documentTime: 2 }),
  };
  browser.page = { mainFrame: () => main, frames: () => [main] };
  await assert.rejects(inspectFormSession(browser, { url: snapshot().url }), {
    code: 'form-changed',
  });
  assert.deepEqual(events, [
    {
      event: 'document-changed',
      frame: 'frame-1',
      previous: { url: snapshot().url, documentTime: 1 },
      current: { url: snapshot().url, documentTime: 2 },
    },
    { event: 'document-check-failed', frame: 'frame-1', code: 'form-changed' },
  ]);
});

test('Forms CLI reports the shared snapshot and closes both browser and store on failure', async () => {
  const browser = session();
  let closed = 0;
  const commands = createFormsCommands({
    openStore: async () => ({
      close: async () => {
        closed++;
      },
    }),
    openSession: async () => browser,
  });
  const output = [];
  assert.equal(
    await commands['forms-read'](
      { url: snapshot().url, headless: 'true' },
      (value) => output.push(JSON.parse(value))
    ),
    0
  );
  assert.equal(output[0].mode, 'read-only');
  await assert.rejects(
    commands['forms-read']({ url: 'file:///bad' }, () => {}),
    { code: 'form-url' }
  );
  assert.equal(closed, 2);
});

test('unreadable frame attempts stay bounded and a total field cap stops traversal', async () => {
  const browser = session();
  const main = { evaluate: async () => snapshot() };
  let attempts = 0;
  const children = Array.from({ length: 12 }, () => ({
    parentFrame: () => main,
    frameElement: async () => {
      attempts++;
      throw new Error('unavailable');
    },
  }));
  browser.page = { mainFrame: () => main, frames: () => [main, ...children] };
  const result = await inspectFormSession(browser, { url: snapshot().url });
  assert.equal(attempts, 9);
  assert.equal(result.omissions.at(-1).reason, 'frame-limit');
  browser.commander.evaluate = async () => ({
    ...snapshot(),
    fields: Array.from({ length: 200 }, (_, i) => ({ id: `field-${i}` })),
  });
  const full = await inspectFormSession(browser, { url: snapshot().url });
  assert.equal(attempts, 9);
  assert.equal(full.fields.length, 200);
  assert.equal(full.omissions[0].reason, 'field-limit');
});

test('invalid slot/headless options never launch a browser', async () => {
  let opened = 0;
  const reader = createFormReader({
    openSession: async () => {
      opened++;
    },
  });
  await assert.rejects(
    reader.read({ url: snapshot().url, browserSlot: '../shared' }),
    { code: 'bad-browser-policy' }
  );
  await assert.rejects(reader.read({ url: snapshot().url, headless: 'true' }), {
    code: 'form-options',
  });
  assert.equal(opened, 0);
});

test(
  'server shutdown waits for a pending Forms launch and closes the browser it eventually owns',
  { timeout: 15000 },
  async () => {
    const entered = deferred();
    const launch = deferred();
    const browser = session();
    const server = await startServer({
      store: createMemoryStore(),
      port: 0,
      enableSync: false,
      enableHandlers: false,
      telegramAccount: false,
      automations: { scheduler: false },
      forms: {
        openSession: () => {
          entered.resolve();
          return launch.promise;
        },
      },
    });
    const request = fetch(`http://127.0.0.1:${server.port}/api/forms/read`, {
      method: 'POST',
      headers: { 'content-type': LINO_TEXT },
      body: encodeWire({ url: snapshot().url }, LINO_TEXT),
    }).catch(() => null);
    await entered.promise;
    let closed = false;
    const closing = server.close().then(() => {
      closed = true;
    });
    await Promise.resolve();
    assert.equal(closed, false);
    launch.resolve(browser);
    await Promise.all([request, closing]);
    assert.deepEqual(browser.calls, [['close']]);
  }
);

test(
  'text/binary Lino controls expose the same read-only report and unavailable capabilities honestly',
  { timeout: 15000 },
  async () => {
    const browsers = [];
    const server = await startServer({
      store: createMemoryStore(),
      port: 0,
      enableSync: false,
      enableHandlers: false,
      telegramAccount: false,
      automations: { scheduler: false },
      forms: {
        availability: available,
        openSession: async () => {
          const browser = session();
          browsers.push(browser);
          return browser;
        },
      },
    });
    try {
      const base = `http://127.0.0.1:${server.port}`;
      const capabilities = await readWireResponse(
        await fetch(`${base}/api/forms/capabilities`)
      );
      assert.equal(capabilities.read, true);
      assert.equal(capabilities.fill, true);
      assert.equal(
        capabilities.fillScope,
        'reviewed-native-text-select-checkbox-radio'
      );
      assert.equal(capabilities.submit, false);
      for (const type of [LINO_TEXT, LINO_BINARY]) {
        const response = await fetch(`${base}/api/forms/read`, {
          method: 'POST',
          headers: { accept: type, 'content-type': type },
          body: encodeWire({ url: snapshot().url }, type),
        });
        assert.equal(response.status, 200);
        assert.equal(response.headers.get('content-type').includes(type), true);
        assert.equal((await readWireResponse(response)).mode, 'read-only');
      }
      const forbidden = await fetch(`${base}/api/forms/read`, {
        method: 'POST',
        headers: {
          origin: 'https://untrusted.example',
          'content-type': LINO_TEXT,
        },
        body: encodeWire({ url: snapshot().url }, LINO_TEXT),
      });
      assert.equal(forbidden.status, 403);
      assert.equal(browsers.length, 2);
      assert.equal(
        browsers.every((browser) => browser.calls.at(-1)[0] === 'close'),
        true
      );
      assert.equal(
        isReadRequest('/api/forms/read', 'POST'),
        false,
        'connection recovery never silently relaunches an inspection'
      );
    } finally {
      await server.close();
    }
    const reader = createFormReader({
      availability: async () => ({
        available: false,
        reason: 'missing',
        missing: ['playwright'],
      }),
    });
    assert.equal((await reader.capabilities()).read, false);
  }
);
