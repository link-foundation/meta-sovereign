import {
  seedGratitude,
  gratitudePreset,
  gratitudeMessage,
} from './vk-gratitude-fixture.mjs';
import { createAutomationScheduler } from '../../js/src/automation/scheduler.js';
const store = await seedGratitude();
await store.put({ ...gratitudePreset(), enabled: true });
const message = gratitudeMessage(10, '41', 'Спасибо!');
const scheduler = createAutomationScheduler({
  store,
  log: console.log,
  runner: {
    run: async () => {
      console.log('admitted');
      return {};
    },
  },
});
console.log(JSON.stringify(message));
console.log(await scheduler.onMessage(message));
await scheduler.stop();
