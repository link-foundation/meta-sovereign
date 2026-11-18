import { loadPreviousModule } from './previous-module.mjs';

for (const name of [
  'browser-send-consent',
  'browser-sender',
  'vk',
  'telegram-send',
  'telegram-account',
  'telegram',
  'whatsapp',
  'email-live',
  'email-node-transport',
]) {
  loadPreviousModule('dfd3213b', `js/src/sources/${name}.js`);
}
await import('../../js/tests/consent-sdk.test.js');
await import('../../js/tests/consent-telegram-parts.test.js');
