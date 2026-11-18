import { loadPreviousModule } from './previous-module.mjs';

loadPreviousModule(
  'b3364503e8bfb4989659e0f4a7fc7de57edbff1c',
  'js/src/jobs/vacancy-skip-service.js'
);
if (process.argv.includes('--native')) {
  await import('./vacancy-skip-preview-native.mjs');
} else {
  await import('../../js/tests/job-vacancy-skip-preview.test.js');
}
