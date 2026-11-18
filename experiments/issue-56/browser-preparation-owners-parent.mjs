import { loadPreviousModule } from './previous-module.mjs';

const parent = 'af27bb6d591e0b8d0149750ae57e96eaf806c0b2';
for (const file of [
  'assignments/read-page.js',
  'forms/review-sessions.js',
  'jobs/login-service.js',
  'sources/auto-import/manager.js',
]) {
  loadPreviousModule(parent, `js/src/${file}`);
}
await import('../../js/tests/browser-preparation-owners.test.js');
