import { loadPreviousModule } from './previous-module.mjs';
for (const name of [
  'application-batch',
  'application-batch-data',
  'application-options',
  'application-salary',
  'application-service',
]) {
  loadPreviousModule('82ff7202', `js/src/jobs/${name}.js`);
}
