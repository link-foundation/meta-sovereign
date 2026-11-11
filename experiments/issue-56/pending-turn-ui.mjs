import { questionBrowserProbe } from './question-browser-probe.mjs';

await questionBrowserProbe({
  pendingOnly: true,
  before: process.argv.includes('--before'),
  screenshots: 'docs/screenshots/issue-56-pending-turn',
});
