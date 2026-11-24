import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import { verifyQuestionUnreadControls } from '../../js/tests/helpers/e2e-question-unread-controls.mjs';
import { verifyUnreadNoticeControls } from '../../js/tests/helpers/e2e-unread-notice-controls.mjs';

const before = process.argv.includes('--before');
const options = {
  screenshots: `docs/screenshots/issue-56-ci-unread-recovery/${before ? 'before' : 'after'}`,
};
await runBrowserScenarios(
  'ci-unread-recovery',
  [
    verifyQuestionUnreadControls,
    ...(before ? [] : [verifyUnreadNoticeControls]),
  ].map((verify) => (browser) => verify(browser, options)),
  { nativeFocus: true }
);
