import { registerHooks } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const parent = process.env.APPLICATION_SEARCH_ATTACHMENT_PARENT;
const before = Boolean(parent);
if (parent) {
  const root = new URL('../../js/src/jobs/', import.meta.url).href;
  registerHooks({
    load(url, context, nextLoad) {
      const sourcePath =
        url.startsWith(root) && join(parent, url.slice(root.length));
      return sourcePath && existsSync(sourcePath)
        ? {
            format: 'module',
            source: readFileSync(sourcePath, 'utf8'),
            shortCircuit: true,
          }
        : nextLoad(url, context);
    },
  });
}
const { runBrowserScenarios } =
  await import('../../js/tests/helpers/e2e-browser-scenarios.mjs');
const { verifyNativeSearchLetterAttachment } =
  await import('../../js/tests/helpers/e2e-application-search-attachment.mjs');
const scenarios = [
  (browser) =>
    verifyNativeSearchLetterAttachment(browser, {
      before,
      screenshots: process.env.APPLICATION_SCREENSHOTS,
    }),
];
if (!before && process.env.APPLICATION_SEARCH_ATTACHMENT_CONTROLS === '1') {
  for (const settings of [
    { mode: 'fallback' },
    { mode: 'duplicate' },
    { ownerDraft: true },
  ]) {
    scenarios.push((browser) =>
      verifyNativeSearchLetterAttachment(browser, settings)
    );
  }
}
await runBrowserScenarios('job-application-search-attachment', scenarios);
