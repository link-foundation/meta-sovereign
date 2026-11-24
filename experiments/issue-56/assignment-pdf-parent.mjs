import { execFileSync } from 'node:child_process';
import { registerHooks } from 'node:module';

const directory = 'js/src/assignments/';
const files = ['source-reader.js', 'read-page.js'];
const snapshots = new Map(
  files.map((file) => [
    new URL(`../../${directory}${file}`, import.meta.url).href,
    execFileSync('git', ['show', `1b31e592:${directory}${file}`]),
  ])
);
registerHooks({
  load(specifier, context, next) {
    return snapshots.has(specifier)
      ? {
          format: 'module',
          source: snapshots.get(specifier),
          shortCircuit: true,
        }
      : next(specifier, context);
  },
});
if (process.argv.includes('--browser')) {
  process.env.RUN_BROWSER_E2E = '1';
  process.env.FORMS_ASSIGNMENT_PDF_ONLY = '1';
  await import('../../js/tests/e2e-forms-reader-browser.mjs');
} else {
  await import('../../js/tests/assignment-pdf.test.js');
}
