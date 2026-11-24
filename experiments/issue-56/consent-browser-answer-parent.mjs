import { loadPreviousModule } from './previous-module.mjs';

for (const name of [
  'browser-sender',
  'browser-choices',
  'browser-text-reply',
  'browser-answer-watch',
]) {
  loadPreviousModule('5565c348', `js/src/sources/${name}.js`);
}
await import('../../js/tests/consent-browser-answer.test.js');
