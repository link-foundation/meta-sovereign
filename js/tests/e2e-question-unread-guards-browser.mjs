import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyUnreadViewGuards } from './helpers/e2e-chat-navigation.mjs';
import {
  verifyUnreadRevealRace,
  verifyUnreadRevealMissing,
} from './helpers/e2e-chat-navigation-race.mjs';

await runBrowserScenarios(
  'question-unread-guards',
  [verifyUnreadViewGuards, verifyUnreadRevealRace, verifyUnreadRevealMissing],
  {
    nativeFocus: true,
  }
);
