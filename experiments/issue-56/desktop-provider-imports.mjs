// Offline loader probe; the isolated production install is checked by hosted staging.
import assert from 'node:assert/strict';
import { browserAvailability } from '../../js/src/cv/browser.js';
import { importTelegram } from '../../js/src/sources/telegram-layer.js';

const browser = await browserAvailability();
assert.equal(browser.available, true, browser.reason);
const telegram = await importTelegram();
assert.equal(typeof telegram.TelegramClient, 'function');
assert.equal(typeof telegram.Api, 'object');
console.log(
  JSON.stringify({
    browser,
    telegram: true,
    browserLaunches: 0,
    accountConnections: 0,
  })
);
