import { loadPreviousModule } from './previous-module.mjs';

for (const name of [
  'browser-send-consent',
  'browser-sender',
  'browser-choices',
  'telegram-send',
]) {
  loadPreviousModule('2761c35b', `js/src/sources/${name}.js`);
}
loadPreviousModule('2761c35b', 'js/src/automation/deliver.js');
await import('../../js/tests/dispatch-stop.test.js');
await import('../../js/tests/dispatch-stop-pilot.test.js');
await import('../../js/tests/consent-telegram-parts.test.js');
