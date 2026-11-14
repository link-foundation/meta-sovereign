import { questionBrowserProbe } from './question-browser-probe.mjs';

const pending = process.argv.includes('--pending');
await questionBrowserProbe({
  wholeTurnOnly: !pending,
  pendingOnly: pending,
  before: process.argv.includes('--before'),
  screenshots: pending ? undefined : 'docs/screenshots/issue-56-whole-turn',
});
