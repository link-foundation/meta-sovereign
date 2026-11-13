// Finite exact-parent probe: one held save and one explicit flush, no stress.
import assert from 'node:assert/strict';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { startReplyCacheFixture } from '../../js/tests/helpers/reply-cache-fixture.mjs';

const before = process.env.REPLY_BEFORE;
const fixture = await startReplyCacheFixture({ before });
let source;
try {
  source = await (
    await fetch(`${fixture.url}${before ? 'before' : 'after'}.js`)
  ).text();
} finally {
  await fixture.close();
}
const { createReplyCache } = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
);
const entered = Promise.withResolvers();
const release = Promise.withResolvers();
let active = 0;
let maximum = 0;
let calls = 0;
const cache = createReplyCache({
  fetchModel: async () => ({
    version: 'alpha.0',
    self: ['me'],
    windowMs: 86_400_000,
    links: [],
  }),
  driver: {
    load: async () => null,
    async save() {
      active += 1;
      calls += 1;
      maximum = Math.max(maximum, active);
      try {
        if (calls === 1) {
          entered.resolve();
          await release.promise;
        }
      } finally {
        active -= 1;
      }
    },
  },
});
await cache.start();
const first = cache.flush();
await entered.promise;
const second = cache.flush();
try {
  await nextTurn();
} finally {
  release.resolve();
  await Promise.all([first, second]);
  await cache.close?.();
}
console.log(JSON.stringify({ parent: before ?? null, maximum, calls }));
assert.equal(maximum, 1, 'reply saves must not overlap');
