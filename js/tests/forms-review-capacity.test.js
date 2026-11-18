import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../src/storage/universal.js';
import { createFormSessions } from '../src/forms/review-sessions.js';
import { createReviewCapacity } from '../src/forms/review-capacity.js';
import { createFormsCommands } from '../src/cli/forms-commands.js';
import { openDualStore } from '../src/storage/dual-store.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { encodeLinoValue } from '../src/transport/lino.js';
import {
  reviewBrowser,
  reviewUrl as url,
} from './helpers/forms-session-fixture.mjs';

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const options = (store = createMemoryStore(), more = {}) => ({
  store,
  learn: false,
  autoCapture: false,
  openSession: async () => reviewBrowser(),
  ...more,
});

test(
  'saved capacity survives closing and reopening the actual dual store',
  { timeout: 10000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ms-review-capacity-'));
    let store;
    let capacity;
    try {
      store = await openDualStore(directory);
      capacity = createReviewCapacity({ store, count: () => 0 });
      const saved = await capacity.configure({
        maxSessions: 17,
        revision: null,
      });
      await capacity.stop();
      await store.close();
      store = await openDualStore(directory);
      capacity = createReviewCapacity({ store, count: () => 0 });
      assert.deepEqual(await capacity.read(), {
        maxSessions: 17,
        revision: saved.revision,
      });
    } finally {
      await capacity?.stop();
      await store?.close();
      await rm(directory, { recursive: true, force: true });
    }
  }
);

test(
  'seventeen independently owned slots are permitted by an owner-selected capacity',
  { timeout: 5000 },
  async () => {
    const sessions = createFormSessions(
      options(undefined, { maxSessions: 17 })
    );
    try {
      const opened = [];
      for (let i = 0; i < 17; i++) {
        opened.push(
          (await sessions.open({ url, browserSlot: `form-${i}` })).session
        );
      }
      assert.equal(sessions.list().sessions.length, 17);
      assert.equal(new Set(opened.map((x) => x.id)).size, 17);
      await assert.rejects(sessions.open({ url, browserSlot: 'extra' }), {
        code: 'form-session-limit',
      });
      await assert.rejects(sessions.open({ url, browserSlot: 'form-0' }), {
        code: 'form-slot-in-use',
      });
      await sessions.close(opened[0].id);
      assert.equal(
        (await sessions.open({ url, browserSlot: 'extra' })).session.state,
        'open'
      );
    } finally {
      await sessions.stop();
    }
  }
);

test(
  'capacity is persistent and revisioned; stale or too-small changes preserve owned slots',
  { timeout: 5000 },
  async () => {
    const store = createMemoryStore();
    const sessions = createFormSessions(options(store));
    try {
      assert.deepEqual(await sessions.capacity(), {
        maxSessions: 4,
        revision: null,
      });
      const saved = await sessions.configureCapacity({
        maxSessions: 17,
        revision: null,
      });
      assert.equal(saved.ok, true);
      const reopened = createFormSessions(options(store));
      try {
        assert.deepEqual(await reopened.capacity(), {
          maxSessions: 17,
          revision: saved.revision,
        });
      } finally {
        await reopened.stop();
      }
      await assert.rejects(
        sessions.configureCapacity({ maxSessions: 2, revision: null }),
        { code: 'form-capacity-changed' }
      );
      const first = await sessions.open({ url, browserSlot: 'one' });
      await sessions.open({ url, browserSlot: 'two' });
      await assert.rejects(
        sessions.configureCapacity({
          maxSessions: 1,
          revision: saved.revision,
        }),
        { code: 'form-capacity-in-use' }
      );
      assert.equal((await sessions.capacity()).maxSessions, 17);
      await sessions.close(first.session.id);
      assert.equal(
        (
          await sessions.configureCapacity({
            maxSessions: 1,
            revision: saved.revision,
          })
        ).maxSessions,
        1
      );
    } finally {
      await sessions.stop();
    }
  }
);

test(
  'simultaneous launches reserve capacity before awaiting a browser',
  { timeout: 5000 },
  async () => {
    const launch = deferred();
    const started = deferred();
    let launches = 0;
    const sessions = createFormSessions(
      options(undefined, {
        maxSessions: 1,
        openSession: async () => {
          launches++;
          started.resolve();
          return launch.promise;
        },
      })
    );
    const first = sessions.open({ url, browserSlot: 'one' });
    try {
      await started.promise;
      await assert.rejects(sessions.open({ url, browserSlot: 'two' }), {
        code: 'form-session-limit',
      });
      assert.equal(launches, 1);
      launch.resolve(reviewBrowser());
      await first;
    } finally {
      launch.resolve(reviewBrowser());
      await first.catch(() => {});
      await sessions.stop();
    }
  }
);

test(
  'pending capacity writes hold reservations, and failed writes never raise the admitted limit',
  { timeout: 5000 },
  async () => {
    const store = createMemoryStore();
    const put = store.put.bind(store);
    const entered = deferred();
    const writing = deferred();
    store.put = async (value) => {
      entered.resolve();
      await writing.promise;
      return put(value);
    };
    let launches = 0;
    const sessions = createFormSessions(
      options(store, {
        maxSessions: 1,
        openSession: async () => {
          launches++;
          return reviewBrowser();
        },
      })
    );
    try {
      await sessions.open({ url, browserSlot: 'one' });
      const saved = sessions.configureCapacity({
        maxSessions: 2,
        revision: null,
      });
      await entered.promise;
      const second = sessions.open({ url, browserSlot: 'two' });
      await Promise.resolve();
      assert.equal(launches, 1);
      writing.resolve();
      await saved;
      await second;
      store.put = async () => {
        throw new Error('disk unavailable');
      };
      const revision = (await sessions.capacity()).revision;
      await assert.rejects(
        sessions.configureCapacity({ maxSessions: 3, revision }),
        /disk unavailable/u
      );
      await assert.rejects(sessions.open({ url, browserSlot: 'three' }), {
        code: 'form-session-limit',
      });
      assert.equal(launches, 2);
    } finally {
      writing.resolve();
      await sessions.stop();
    }
  }
);

test(
  'invalid and corrupt capacity refuses rather than allocating browsers or falling back',
  { timeout: 5000 },
  async () => {
    for (const maxSessions of [
      0,
      -1,
      1.5,
      Infinity,
      NaN,
      '17',
      Number.MAX_SAFE_INTEGER + 1,
    ]) {
      assert.throws(
        () => createFormSessions(options(undefined, { maxSessions })),
        { code: 'form-capacity-invalid' }
      );
    }
    const store = createMemoryStore();
    let launches = 0;
    const sessions = createFormSessions(
      options(store, {
        openSession: async () => {
          launches++;
          return reviewBrowser();
        },
      })
    );
    try {
      for (const maxSessions of [0, '5', 1.1, Number.MAX_SAFE_INTEGER + 1]) {
        await assert.rejects(
          sessions.configureCapacity({ maxSessions, revision: null }),
          { code: 'form-capacity-invalid' }
        );
      }
      await store.put({
        id: 'config:form-review-capacity',
        maxSessions: 17,
        revision: 'invalid',
      });
      await assert.rejects(sessions.open({ url }), {
        code: 'form-capacity-invalid',
      });
      assert.equal(launches, 0);
    } finally {
      await sessions.stop();
    }
    const absent = createReviewCapacity({ count: () => 0 });
    await assert.rejects(absent.configure({ maxSessions: 5, revision: null }), {
      code: 'form-capacity-unavailable',
    });
  }
);

test(
  'one CLI invocation accepts five Lino or positional URLs and launches strictly sequentially',
  { timeout: 5000 },
  async () => {
    for (const args of [
      { urls: encodeLinoValue(Array(5).fill(url)) },
      { _: Array(5).fill(url) },
    ]) {
      const store = createMemoryStore();
      const owned = [];
      let active = 0;
      let maximum = 0;
      const commands = createFormsCommands({
        openStore: async () => store,
        openSession: async () => {
          active++;
          maximum = Math.max(maximum, active);
          await Promise.resolve();
          const browser = reviewBrowser();
          owned.push(browser);
          active--;
          return browser;
        },
        async *reviewInput() {
          yield 'list';
          yield 'quit';
        },
        reportWriter: null,
      });
      const output = [];
      assert.equal(
        await commands['forms-review'](args, (line) =>
          output.push(JSON.parse(line))
        ),
        0
      );
      assert.equal(output.filter((x) => x.session?.state === 'open').length, 5);
      assert.equal(output.find((x) => x.sessions?.length === 5).maxSessions, 5);
      assert.equal(maximum, 1);
      assert(
        owned.every(
          (x) => x.calls.filter(([name]) => name === 'close').length === 1
        )
      );
    }
  }
);

test(
  'an invalid batch URL, slot, source combination or capacity launches nothing',
  { timeout: 5000 },
  async () => {
    let opens = 0;
    const commands = createFormsCommands({
      openStore: async () => {
        opens++;
        return createMemoryStore();
      },
    });
    for (const args of [
      { _: [url, 'file:///private'] },
      { _: [url, url], 'browser-slot': 'a'.repeat(63) },
      { _: [url], url },
      { urls: encodeLinoValue([url]), _: [url] },
      { _: [url, url], 'max-sessions': '1' },
      { _: [url], 'max-sessions': '0' },
      { _: [url], 'max-sessions': true },
    ]) {
      await assert.rejects(commands['forms-review'](args, () => {}));
    }
    assert.equal(opens, 0);
  }
);

test(
  'shutdown waits for an issued settings write and refuses new reservations',
  { timeout: 5000 },
  async () => {
    const store = createMemoryStore();
    const put = store.put.bind(store);
    const started = deferred();
    const finish = deferred();
    store.put = async (value) => {
      started.resolve();
      await finish.promise;
      return put(value);
    };
    const sessions = createFormSessions(options(store));
    const saving = sessions.configureCapacity({
      maxSessions: 17,
      revision: null,
    });

    await started.promise;
    let stopped = false;
    const stop = sessions.stop().then(() => {
      stopped = true;
    });
    await Promise.resolve();
    assert.equal(stopped, false);
    await assert.rejects(sessions.open({ url }), { code: 'form-stopped' });
    finish.resolve();
    assert.equal((await saving).maxSessions, 17);
    await stop;
    assert.equal(stopped, true);
  }
);

test(
  'a failed batch browser does not skip later forms or report a successful batch',
  { timeout: 5000 },
  async () => {
    let attempts = 0;
    const owned = [];
    const commands = createFormsCommands({
      openStore: async () => createMemoryStore(),
      openSession: async () => {
        attempts++;
        if (attempts === 2) {
          throw new Error('second browser unavailable');
        }
        const browser = reviewBrowser();
        owned.push(browser);
        return browser;
      },
      async *reviewInput() {
        yield 'quit';
      },
      reportWriter: null,
    });
    const output = [];
    assert.equal(
      await commands['forms-review']({ _: [url, url, url] }, (line) =>
        output.push(JSON.parse(line))
      ),
      1
    );
    assert.equal(attempts, 3);
    assert.equal(output.filter((x) => x.session?.state === 'open').length, 2);
    assert.equal(output.find((x) => x.ok === false).browserSlot, 'form-2');
    assert(
      owned.every(
        (x) => x.calls.filter(([name]) => name === 'close').length === 1
      )
    );
  }
);

test(
  'Stop owns a capacity read before any slot or browser is reserved',
  { timeout: 5000 },
  async () => {
    const store = createMemoryStore();
    const entered = deferred();
    const reading = deferred();
    store.get = async () => {
      entered.resolve();
      await reading.promise;
      return null;
    };
    let launches = 0;
    const sessions = createFormSessions(
      options(store, {
        openSession: async () => {
          launches++;
          return reviewBrowser();
        },
      })
    );
    const opening = assert.rejects(sessions.open({ url }), {
      code: 'form-stopped',
    });
    await entered.promise;
    const stopping = sessions.stop();
    reading.resolve();
    await Promise.all([opening, stopping]);
    assert.equal(launches, 0);
    assert.equal(sessions.list().sessions.length, 0);
  }
);
