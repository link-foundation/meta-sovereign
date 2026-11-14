import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import {
  verifyUnreadRevealRace,
  verifyUnreadRevealMissing,
} from '../../js/tests/helpers/e2e-chat-navigation-race.mjs';

await runBrowserScenarios(
  'unread-reveal',
  [
    (browser) =>
      verifyUnreadRevealRace(browser, {
        screenshots: process.env.UNREAD_REVEAL_SCREENSHOTS,
      }),
    verifyUnreadRevealMissing,
  ],
  { nativeFocus: true }
);
