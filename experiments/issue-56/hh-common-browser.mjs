import { createMemoryStore } from '../../js/src/storage/universal.js';
import { openChatApp } from '../../js/tests/helpers/e2e-chat.mjs';
import { verifyHhCommon } from '../../js/tests/helpers/e2e-hh-common.mjs';
import { hhCommonFixture } from './hh-common-fixture.mjs';
import {
  TUTORIAL_STORAGE_KEY,
  TUTORIAL_VERSION,
} from '../../js/src/web/tutorial.js';

const store = createMemoryStore();
const fake = hhCommonFixture();
const app = await openChatApp('hh-common', {
  store,
  serverOptions: {
    pulls: {
      hh: { ...fake, maxRequests: 2 },
      minGapMs: 0,
      intervals: { vk: 0, upwork: 0, peopleperhour: 0 },
    },
  },
});
await app.page.addInitScript(
  ({ key, value }) => globalThis.localStorage.setItem(key, value),
  {
    key: TUTORIAL_STORAGE_KEY,
    value: JSON.stringify({ off: true, v: TUTORIAL_VERSION }),
  }
);
await app.finish(() =>
  verifyHhCommon({
    ...app,
    store,
    fake,
    before: process.env.HH_COMMON_BEFORE_BUNDLE === '1',
  })
);
