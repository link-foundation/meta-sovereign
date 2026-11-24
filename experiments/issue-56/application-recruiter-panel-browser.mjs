import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const parent = process.env.APPLICATION_RECRUITER_PANEL_PARENT;
const learningParent = process.env.E2E_RECRUITER_PANEL_LEARNING_PARENT === '1';
const prepareReply = process.env.E2E_RECRUITER_PANEL_PREPARE_REPLY === '1';
const exactReply = process.env.E2E_RECRUITER_PANEL_EXACT_REPLY === '1';
const terminal = process.env.E2E_RECRUITER_PANEL_TERMINAL === '1';
const reuseReply = process.env.E2E_RECRUITER_PANEL_REUSE === '1';
const skipRecruiter = process.env.E2E_RECRUITER_PANEL_SKIP === '1';
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
  if (
    learningParent ||
    prepareReply ||
    exactReply ||
    reuseReply ||
    skipRecruiter
  ) {
    files.add('application-recruiter-panel.js');
  }
  if (exactReply || reuseReply) {
    files.add('application-recruiter-draft.js');
  }
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
        !learningParent &&
        !prepareReply &&
        !exactReply &&
        !reuseReply &&
        !skipRecruiter &&
        process.env.E2E_RECRUITER_PANEL_BINDING_PARENT !== '1',
      screenshots: process.env.E2E_ARTIFACT_DIR,
      webBundle: process.env.APPLICATION_RECRUITER_PANEL_PARENT_WEB,
      manualSend: process.env.E2E_RECRUITER_PANEL_MANUAL_SEND === '1',
      verifyBinding:
        !learningParent && process.env.E2E_RECRUITER_PANEL_SKIP_BINDING !== '1',
      ownerReply: process.env.E2E_RECRUITER_PANEL_LEARN_REPLY === '1',
      prepareReply,
      exactReply,
      terminal,
      reuseReply,
      skipRecruiter,
      verifyPending: !learningParent,
      ...(process.env.E2E_RECRUITER_PANEL_IMMEDIATE === '1'
        ? { panelDelayMs: 0 }
        : {}),
    }),
]);
