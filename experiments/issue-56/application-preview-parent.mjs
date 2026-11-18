import { loadPreviousModule } from './previous-module.mjs';

for (const file of [
  'jobs/application-options.js',
  'jobs/application-actions.js',
  'jobs/application-full-form.js',
  'jobs/application-result.js',
  'jobs/application-batch-data.js',
  'cli/application-command.js',
  'web/application-panel.js',
]) {
  loadPreviousModule('d21b7f97', `js/src/${file}`);
}
await import('../../js/tests/application-preview.test.js');
await import('../../js/tests/application-preview-controls.test.js');
