import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const parent = process.env.APPLICATION_DELIVERED_RETURN_PARENT;
if (parent) {
  const jobs = new URL('../../js/src/jobs/', import.meta.url).href;
  const files = new Set([
    'application-actions.js',
    'application-attachment.js',
    'application-options.js',
    'application-page.js',
    'application-review.js',
    'application-search-route.js',
  ]);
  registerHooks({
    load(url, context, nextLoad) {
      if (url.startsWith(jobs)) {
        const file = basename(fileURLToPath(url));
        if (files.has(file)) {
          return {
            format: 'module',
            source: readFileSync(join(parent, file), 'utf8'),
            shortCircuit: true,
          };
        }
      }
      return nextLoad(url, context);
    },
  });
}

const { runBrowserScenarios } =
  await import('../../js/tests/helpers/e2e-browser-scenarios.mjs');
const { verifyNativeApplicationDeliveredReturn } =
  await import('../../js/tests/helpers/e2e-application-delivered-return.mjs');
await runBrowserScenarios('job-application-delivered-return', [
  (browser) =>
    verifyNativeApplicationDeliveredReturn(browser, {
      before: Boolean(parent),
      screenshots: process.env.E2E_ARTIFACT_DIR,
      webBundle: process.env.APPLICATION_DELIVERED_RETURN_PARENT_WEB,
    }),
]);
