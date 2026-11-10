// Focused entry point for the same production UI assertions used by CI.
import { createMemoryStore } from '../../js/src/storage/universal.js';
import { openChatApp } from '../../js/tests/helpers/e2e-chat.mjs';
import { verifyQuestionSharedProfile } from '../../js/tests/helpers/e2e-question-shared-profile.mjs';
import {
  TUTORIAL_STORAGE_KEY,
  TUTORIAL_VERSION,
} from '../../js/src/web/tutorial.js';

const store = createMemoryStore();
const { page, base, finish } = await openChatApp('shared-profile', { store });
await page.addInitScript(
  ({ key, value }) => globalThis.localStorage.setItem(key, value),
  {
    key: TUTORIAL_STORAGE_KEY,
    value: JSON.stringify({ off: true, v: TUTORIAL_VERSION }),
  }
);
await finish(() => verifyQuestionSharedProfile({ page, base, store }));
