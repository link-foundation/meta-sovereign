import { loadPreviousModule } from './previous-module.mjs';

for (const file of [
  'jobs/application-options.js',
  'jobs/application-actions.js',
  'jobs/application-full-form.js',
  'jobs/application-result.js',
  'jobs/application-batch-data.js',
  'cli/application-command.js',
  'cli/application-configuration.js',
  'web/application-panel.js',
]) {
  loadPreviousModule('ef34179a', `js/src/${file}`);
}
await import('../../js/tests/application-search-route.test.js');
await import('../../js/tests/application-search-route-controls.test.js');
