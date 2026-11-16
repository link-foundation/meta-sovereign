import { questionBrowserProbe } from './question-browser-probe.mjs';
import { verifyNativeApplicationChats } from '../../js/tests/helpers/e2e-application-chats.mjs';
await questionBrowserProbe(
  {
    before: process.argv.includes('--before'),
    screenshots: 'docs/screenshots/issue-56-application-chats',
  },
  verifyNativeApplicationChats
);
