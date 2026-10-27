import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createChatFeed, chatFeedFor } from '../src/web/chat-feed.js';
import { telegramStatusFor } from '../src/web/telegram-status.js';
import { createAvailability } from '../src/web/server-availability.js';

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { resolve, promise };
};
test('refreshes coalesce, paint directory progress and retain live updates across a slow load', async () => {
  const gate = deferred();
  let calls = 0;
  const feed = createChatFeed({
    load: async (progress) => {
      calls += 1;
      progress([{ id: 'read:1', unreadCount: 1 }]);
      await gate.promise;
      return [{ id: 'read:1', unreadCount: 1 }];
    },
  });
  const pending = feed.refresh();
  await Promise.resolve();
  assert.equal(
    feed.snapshot().links.length,
    1,
    'first card does not wait for the browser cache'
  );
  feed.push([{ type: 'put', link: { id: 'read:1', unreadCount: 0 } }]);
  for (let i = 0; i < 10; i++) {
    assert.equal(feed.refresh(), pending);
  }
  gate.resolve();
  await pending;
  assert.equal(calls, 1);
  assert.equal(
    feed.snapshot().links[0].unreadCount,
    0,
    'an older response cannot undo a live read'
  );
});
test('a failed directory cannot become a false empty queue or erase the last good snapshot', async () => {
  let down = true;
  const feed = createChatFeed({
    load: async () => {
      if (down) {
        throw Object.assign(new Error('unavailable'), { local: [] });
      }
      return [{ id: 'read:1' }];
    },
  });
  await feed.refresh();
  assert.equal(feed.snapshot().links, null);
  assert.equal(feed.snapshot().failed, 'unavailable');
  down = false;
  await feed.refresh();
  const last = feed.snapshot().links;
  down = true;
  await feed.refresh();
  assert.equal(feed.snapshot().links, last);
});
test('view remounts share their feed but separate accounts and API instances do not', () => {
  const api = {};
  assert.equal(chatFeedFor(api, 1), chatFeedFor(api, 1));
  assert.notEqual(chatFeedFor(api, 1), chatFeedFor(api, 2));
  assert.notEqual(chatFeedFor(api, 1), chatFeedFor({}, 1));
});

test('overlapping views share one live stream and release it after the last view closes', async () => {
  let opens = 0;
  let closes = 0;
  const feed = createChatFeed({
    load: async () => [],
    events: async (_event, state) => {
      opens += 1;
      state('open');
      return () => {
        closes += 1;
      };
    },
  });
  const first = feed.follow();
  const second = feed.follow();
  await feed.refresh();
  assert.equal(opens, 1);
  assert.equal(feed.snapshot().live, true);
  first();
  assert.equal(closes, 0);
  second();
  assert.equal(closes, 1);
  assert.equal(feed.snapshot().live, false);
});
test('Telegram status reads coalesce and preserve sign-in through transport errors, but accept real logout', async () => {
  let value = { connected: true, kind: 'user' };
  let calls = 0;
  const api = {
    telegramStatus: async () => {
      calls += 1;
      return value;
    },
  };
  const status = telegramStatusFor(api);
  await Promise.all([status.read(), status.read(), status.read()]);
  assert.equal(calls, 1);
  value = { connected: false, offline: true };
  assert.equal((await status.read()).connected, true);
  value = { connected: false, kind: null };
  assert.equal((await status.read()).connected, false);
  assert.equal(telegramStatusFor(api, 2).snapshot(), null);
});
test('an older failed availability probe cannot override a successful API response', async () => {
  const gate = deferred();
  const target = { origin: 'http://local', fetchImpl: () => gate.promise };
  const modes = [];
  const watch = createAvailability({
    server: () => target,
    setOnline: (value) => modes.push(value),
  });
  const check = watch.failed();
  await Promise.resolve();
  assert.equal(watch.failed(), check);
  watch.reached();
  gate.resolve(Promise.reject(new Error('old timeout')));
  await check;
  assert.deepEqual(modes, [true]);
  watch.stop();
});
