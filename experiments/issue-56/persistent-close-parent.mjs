import { loadPreviousModule } from './previous-module.mjs';

loadPreviousModule(
  '3ca58536df184607163e2fba848958fa127b7555',
  'js/src/cv/persistent-browser.js'
);
await import('../../js/tests/persistent-process.test.js');
