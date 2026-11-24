import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const parent = process.env.APPLICATION_RECRUITER_PANEL_PARENT;
if (parent) {
  const jobs = new URL('../../js/src/jobs/', import.meta.url).href;
  const files = new Set([
    'application-attachment.js',
    'application-batch.js',
    'application-options.js',
    'application-page.js',
    'application-result.js',
    'application-review.js',
    'application-search-route.js',
    'application-service.js',
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
const { verifyNativeApplicationRecruiterPanel } =
  await import('../../js/tests/helpers/e2e-application-recruiter-panel.mjs');
await runBrowserScenarios('job-application-recruiter-panel', [
  (browser) =>
    verifyNativeApplicationRecruiterPanel(browser, {
      before:
        Boolean(parent) &&
        process.env.E2E_RECRUITER_PANEL_BINDING_PARENT !== '1',
      screenshots: process.env.E2E_ARTIFACT_DIR,
      webBundle: process.env.APPLICATION_RECRUITER_PANEL_PARENT_WEB,
      manualSend: process.env.E2E_RECRUITER_PANEL_MANUAL_SEND === '1',
      verifyBinding: process.env.E2E_RECRUITER_PANEL_SKIP_BINDING !== '1',
      ...(process.env.E2E_RECRUITER_PANEL_IMMEDIATE === '1'
        ? { panelDelayMs: 0 }
        : {}),
    }),
]);
