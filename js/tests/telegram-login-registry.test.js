import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setImmediate } from 'node:timers';
import {
  beginTelegramLogin,
  closeTelegramLogin,
  closeTelegramLogins,
  findTelegramLogin,
  trackTelegramLogin,
} from '../src/server/telegram-login-registry.js';

const tick = () => new Promise((r) => setImmediate(r));
const wait = (ms) => new Promise((r) => globalThis.setTimeout(r, ms));
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
const entryFor = (cancel = async () => {}) => ({
  login: { cancel },
  apiHash: 'secret',
});

test(
  'registry bounds pending clients and closes a refused ninth login',
  { timeout: 1000 },
  async () => {
    const ctx = {};
    let closed = 0;
    const entry = () =>
      entryFor(async () => {
        closed++;
      });
    const ids = [];
    for (let i = 0; i < 8; i++) {
      ids.push(await trackTelegramLogin(ctx, entry()));
    }
    assert.equal(new Set(ids).size, 8);
    await assert.rejects(() => trackTelegramLogin(ctx, entry()), {
      status: 409,
    });
    assert.equal(closed, 1);
    await closeTelegramLogins(ctx);
    assert.equal(closed, 9);
    assert.equal(ctx.telegramLogins.size, 0);
    await assert.rejects(() => trackTelegramLogin(ctx, entry()), {
      status: 409,
    });
    assert.equal(closed, 10);
  }
);

test(
  'expiry drops credentials and shutdown awaits an expiry cleanup already in progress',
  { timeout: 1000 },
  async () => {
    const ctx = {};
    const cleanup = deferred();
    let closing = 0;
    const id = await trackTelegramLogin(
      ctx,
      entryFor(async () => {
        closing++;
        await cleanup.promise;
      }),
      { ttlMs: 10 }
    );
    await wait(30);
    assert.equal(findTelegramLogin(ctx, id), undefined);
    assert.equal(closing, 1);
    let finished = false;
    const stopped = closeTelegramLogins(ctx).then(() => {
      finished = true;
    });
    await tick();
    assert.equal(finished, false);
    cleanup.resolve();
    await stopped;
    assert.equal(ctx.telegramLoginClosings.size, 0);
  }
);

test(
  'shutdown awaits factories in progress and closes their late clients',
  { timeout: 1000 },
  async () => {
    const ctx = {};
    const factory = deferred();
    let closed = 0;
    const started = beginTelegramLogin(ctx, async () => {
      await factory.promise;
      return trackTelegramLogin(
        ctx,
        entryFor(async () => {
          closed++;
        })
      );
    });
    const rejected = assert.rejects(() => started, { status: 409 });
    const stopped = closeTelegramLogins(ctx);
    factory.resolve();
    await rejected;
    await stopped;
    assert.equal(closed, 1);
    assert.equal(ctx.telegramLoginStarts.size, 0);
    assert.throws(() => beginTelegramLogin(ctx, async () => {}), {
      status: 409,
    });
  }
);

test(
  'explicit cancellation removes the registry entry before awaiting cleanup',
  { timeout: 1000 },
  async () => {
    const ctx = {};
    const cleanup = deferred();
    const id = await trackTelegramLogin(
      ctx,
      entryFor(() => cleanup.promise)
    );
    const cancelled = closeTelegramLogin(ctx, id);
    assert.equal(findTelegramLogin(ctx, id), undefined);
    cleanup.resolve();
    await cancelled;
    await closeTelegramLogin(ctx, id);
    await closeTelegramLogins(ctx);
  }
);
