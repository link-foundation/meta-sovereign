// Bounded trace of the two production profile flows implicated by hosted WebKit.
import { createMemoryStore } from '../../js/src/storage/universal.js';
import { openChatApp } from '../../js/tests/helpers/e2e-chat.mjs';
import { verifyQuestionSharedProfile } from '../../js/tests/helpers/e2e-question-shared-profile.mjs';
import { verifyQuestionLegacyProfile } from '../../js/tests/helpers/e2e-question-legacy-profile.mjs';
import {
  traceBrowserDetails,
  inputTrace,
} from '../../js/tests/helpers/e2e-input-trace.mjs';
import { traceBrowserScenario } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import {
  TUTORIAL_STORAGE_KEY,
  TUTORIAL_VERSION,
} from '../../js/src/web/tutorial.js';

const store = createMemoryStore();
const { page, base, finish } = await openChatApp('profile-navigation', {
  store,
});
await page.addInitScript(
  ({ key, value }) => globalThis.localStorage.setItem(key, value),
  {
    key: TUTORIAL_STORAGE_KEY,
    value: JSON.stringify({ off: true, v: TUTORIAL_VERSION }),
  }
);
await traceBrowserDetails(page, '[data-question-controls]');
await finish(async () => {
  for (const verify of [
    verifyQuestionSharedProfile,
    verifyQuestionLegacyProfile,
  ]) {
    try {
      await traceBrowserScenario('profile-navigation', verify.name, () =>
        verify({ page, base, store })
      );
    } finally {
      console.log('[profile-state]', JSON.stringify(await inputTrace(page)));
    }
  }
});
