// No server, socket or watchdog keeps this child alive: the owned job must do so.
import assert from 'node:assert/strict';
import { setInterval, clearInterval } from 'node:timers';
import { createMemoryStore } from '../../js/src/storage/universal.js';
import { createVkOnlineJob } from '../../js/src/automation/vk-online.js';
import { createVkFriendsJob } from '../../js/src/automation/vk-friends.js';
import { createVkWallJob } from '../../js/src/automation/vk-wall.js';

const factories = {
  online: createVkOnlineJob,
  friends: createVkFriendsJob,
  wall: createVkWallJob,
};
const kind = process.argv[2];
assert.ok(Object.hasOwn(factories, kind), 'A known scheduler is required');
let ticks = 0;
let effects = 0;
let timers = 0;
const events = [];
const job = factories[kind]({
  store: createMemoryStore(),
  resolve: () => {
    effects++;
    throw new Error('Disabled scheduling must not resolve a provider');
  },
  optionsFor: () => {
    effects++;
    throw new Error('Disabled scheduling must not read credentials');
  },
  log: (entry) => events.push(entry),
  setInterval(callback, delay) {
    assert.equal(
      delay,
      60000,
      'Production scheduling keeps its minute cadence'
    );
    timers++;
    return setInterval(async () => {
      await callback();
      ticks++;
      if (ticks === 3) {
        await job.stop();
        assert.equal(effects, 0);
        assert.equal(timers, 1, 'Repeated start must not add another timer');
        assert.equal(
          events.filter((e) => e.event === 'trigger_check').length,
          3
        );
        assert.equal(
          events.filter((e) => e.event === 'trigger_finished').length,
          3
        );
        process.stdout.write(
          `${JSON.stringify({ kind, ticks, effects, timers, closed: true })}\n`
        );
      }
    }, 10);
  },
  clearInterval,
});
job.start();
job.start();
