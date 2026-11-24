import { loadPreviousModule } from './previous-module.mjs';

for (const path of [
  'js/src/assignments/vacancy.js',
  'js/src/jobs/discovery-data.js',
  'js/src/jobs/discovery.js',
  'js/src/jobs/service.js',
]) {
  loadPreviousModule('5f63c49f', path);
}
await import('../../js/tests/discovery-memory.test.js');
