import { loadPreviousModule } from './previous-module.mjs';

const parent = '6c90c3f50f97102ee214cb7e4acb707f5eae99b2';
const paths = [
  'js/src/assignments/vacancy-application.js',
  'js/src/assignments/vacancy.js',
  'js/src/automation/question-browser-vacancy.js',
  'js/src/jobs/application-batch-data.js',
  'js/src/jobs/application-journal.js',
  'js/src/jobs/application-options.js',
  'js/src/jobs/application-result.js',
  'js/src/jobs/application-review.js',
  'js/src/jobs/application-service.js',
];
for (const path of paths) {
  loadPreviousModule(parent, path);
}
await import('../../js/tests/application-collection.test.js');
