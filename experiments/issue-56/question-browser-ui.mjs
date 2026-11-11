import { questionBrowserProbe } from './question-browser-probe.mjs';

const before = process.argv.includes('--before');
await questionBrowserProbe({
  before,
  screenshots: `docs/screenshots/issue-56-question-browser/${before ? 'before' : 'after'}`,
});
