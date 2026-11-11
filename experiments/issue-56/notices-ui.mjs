// Exercise notice editing/planning in the production app using its web bundle.
import { createMemoryStore } from '../../js/src/storage/universal.js';
import { assert, openChatApp } from '../../js/tests/helpers/e2e-chat.mjs';
import { verifyQuestionNotices } from '../../js/tests/helpers/e2e-question-notices.mjs';
import {
  TUTORIAL_STORAGE_KEY,
  TUTORIAL_VERSION,
} from '../../js/src/web/tutorial.js';

const store = createMemoryStore();
let sends = 0;
const fixture = await openChatApp('notices', {
  store,
  send: async () => {
    sends++;
    return { via: 'fixture' };
  },
});
await fixture.page.addInitScript(
  ({ key, version }) => {
    globalThis.localStorage.setItem(
      key,
      JSON.stringify({ off: true, v: version })
    );
    globalThis.localStorage.setItem('metaSovereignLocale', 'en');
  },
  { key: TUTORIAL_STORAGE_KEY, version: TUTORIAL_VERSION }
);
await fixture.finish(async () => {
  const result = await verifyQuestionNotices({
    ...fixture,
    store,
    before: process.argv.includes('--before'),
    screenshots: process.env.NOTICE_SCREENSHOTS,
  });
  assert(sends === 0, 'notice review issues zero provider sends');
  console.log(
    '[notice-results]',
    JSON.stringify({ ...result, providerSends: sends })
  );
});
