// Real browser e2e for Archive and mute new chats (R-Y174), as Telegram
// Desktop's Settings has it: in Privacy and security a section shows the
// switches of Telegram's global privacy settings (archive and mute new
// chats from non-contacts, keep archived chats unmuted, keep folders; and,
// under read marks, hide read time and Premium-only messages). Nothing is
// sent until a switch is clicked; a click sends all five values; a refusal
// (PREMIUM_ACCOUNT_REQUIRED) is shown as text and the switch stays.
// Telegram's answers faked in the page, a fake chat in a memory store, a
// server on a free port, a headless browser; nothing reaches a network or
// a running app. Not part of `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:archive-settings

import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const CHAT = '5';
const store = createMemoryStore();
await store.put({
  ...{ id: `msg:telegram:${CHAT}:1`, source: 'telegram', chat: CHAT },
  ...{ chatName: 'Some Friend', senderName: 'Some Friend' },
  ...{ chatType: 'private', sender: CHAT, body: 'hi', raw: { id: 1 } },
  timestamp: new Date(Date.now() - 60_000).toISOString(),
});

const { base, page, until, finish } = await openChatApp('archive-settings', {
  store,
});

await page.route('**/api/telegram/profile', (route) =>
  fulfil(route, {
    ok: true,
    id: '7',
    firstName: 'Ann',
    lastName: 'Lee',
    about: '',
    username: 'annlee',
    phone: '+15551234567',
    hasPhoto: false,
    aboutMax: 70,
  })
);
// The rest of the dialog, empty.
await page.route('**/api/telegram/privacy', (route) =>
  fulfil(route, { ok: true, keys: [] })
);
await page.route('**/api/telegram/privacy-ttl', (route) =>
  fulfil(route, { ok: true, period: 0 })
);
await page.route('**/api/telegram/sessions', (route) =>
  fulfil(route, { ok: true, ttlDays: 0, sessions: [] })
);
await page.route('**/api/telegram/web-sessions', (route) =>
  fulfil(route, { ok: true, sessions: [] })
);
await page.route('**/api/telegram/blocked', (route) =>
  fulfil(route, { ok: true, count: 0, items: [], next: null })
);

let settings = {
  archiveAndMute: false,
  keepUnmuted: true,
  keepFolders: false,
  hideReadMarks: false,
  requirePremium: false,
};
let reads = 0;
const sent = [];
await page.route('**/api/telegram/archive-settings', (route) => {
  reads += 1;
  return fulfil(route, { ok: true, settings });
});
await page.route('**/api/telegram/archive-settings-set', (route) => {
  const body = route.request().postDataJSON();
  sent.push(body);
  if (body.hideReadMarks) {
    return fulfil(route, {
      ok: false,
      error: 'PREMIUM_ACCOUNT_REQUIRED',
      code: 'premium-required',
    });
  }
  settings = body;
  return fulfil(route, { ok: true, settings });
});

const dialog = page.locator('[data-dialog="privacy"]');
const box = (key) => dialog.locator(`[data-field="archive-${key}"]`);

const readSteps = async () => {
  await page.goto(`${base}/`);
  await page.locator(`[data-chat="telegram:${CHAT}"]`).waitFor();
  await page.locator('[data-action="my-profile"]').click();
  await page.locator('[data-action="open-privacy"]').click();
  await box('archiveAndMute').waitFor({ timeout: 5000 });
  assert(reads >= 1, 'the settings were read');
  assert(
    (await dialog.locator('[data-section="archive"] h4').textContent()) ===
      'Archive and mute new chats',
    'the archive section title'
  );
  assert(
    (await dialog
      .locator('[data-section="archive"]')
      .locator('input')
      .count()) === 3,
    'three switches under archive'
  );
  assert(
    (await dialog
      .locator('[data-section="read-marks"]')
      .locator('input')
      .count()) === 2,
    'two switches under privacy'
  );
  assert(!(await box('archiveAndMute').isChecked()), 'archive off');
  assert(await box('keepUnmuted').isChecked(), 'keep unmuted on');
  assert(sent.length === 0, 'nothing sent before a click');
};

const writeSteps = async () => {
  await box('archiveAndMute').click();
  await until(() => sent.length === 1, 'the settings were sent');
  assert(
    JSON.stringify(sent[0]) ===
      JSON.stringify({
        archiveAndMute: true,
        keepUnmuted: true,
        keepFolders: false,
        hideReadMarks: false,
        requirePremium: false,
      }),
    `all five values sent: ${JSON.stringify(sent[0])}`
  );
  await until(() => box('archiveAndMute').isChecked(), 'the switch is on');
  // A second click sends all five again, with the first one kept.
  await box('keepFolders').click();
  await until(() => sent.length === 2, 'second write');
  assert(
    sent[1].archiveAndMute === true && sent[1].keepFolders === true,
    `both kept: ${JSON.stringify(sent[1])}`
  );
};

const refusalSteps = async () => {
  await box('hideReadMarks').click();
  await until(() => sent.length === 3, 'hide read time asked');
  await dialog.locator('[role="alert"]').waitFor();
  assert(
    (await dialog.textContent()).includes('needs Telegram Premium'),
    'the Premium refusal is text'
  );
  assert(!(await box('hideReadMarks').isChecked()), 'the switch stays off');
  assert(sent.length === 3, 'a refusal is not retried');
  // Another switch works after a refusal.
  await box('requirePremium').click();
  await until(() => sent.length === 4, 'Premium-only asked');
  await until(() => box('requirePremium').isChecked(), 'it is on');
};

await finish(async () => {
  await readSteps();
  await writeSteps();
  await refusalSteps();
});
