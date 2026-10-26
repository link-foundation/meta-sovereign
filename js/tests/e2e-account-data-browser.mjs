// Real browser e2e for the account-level settings (R-Y212), as Telegram
// Desktop has them: Change phone number under the phone in My profile (a
// warning first, the new number, the code, Telegram's refusals as text,
// Escape closes), the "If away for" periods up to two years and "Delete my
// account" in Privacy (it explains and opens Telegram's own page in a new
// tab; nothing is deleted from here), and Export Telegram data (the kinds of
// chats, a takeout session, progress with Cancel, "Telegram will allow the
// export in X", a finished export with "Show my data"). The server is real,
// on a free port, over a memory store, with a fake Telegram client and a temp
// directory the files go to; nothing reaches a network or a running app.
// Not part of `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:account-data

import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createMemoryStore } from '../src/storage/universal.js';
import { createAccountData } from '../src/sources/telegram-account-data.js';
import { createPhoneChange } from '../src/sources/telegram-phone-change.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';
import {
  Api,
  helpers,
  rpcError,
  takeoutFake,
} from './helpers/takeout-fakes.mjs';

const CHAT = '5';
const store = createMemoryStore();
await store.put({
  ...{ id: `msg:telegram:${CHAT}:1`, source: 'telegram', chat: CHAT },
  ...{ chatName: 'Some Friend', senderName: 'Some Friend' },
  ...{ chatType: 'private', sender: CHAT, body: 'hi', raw: { id: 1 } },
  timestamp: new Date(Date.now() - 60_000).toISOString(),
});

const root = await mkdtemp(path.join(os.tmpdir(), 'ms-e2e-account-data-'));
// The first history page waits for the test, so the progress can be seen.
let release = null;
const gate = new Promise((resolve) => {
  release = resolve;
});
let held = false;
const hooks = {
  onHistory: async () => {
    if (!held) {
      held = true;
      await gate;
    }
  },
};
const { client, log } = takeoutFake(hooks);
const env = {
  importer: async () => ({ Api, helpers }),
  connection: { withPeer: async (_c, chat, use) => use({ chat }) },
  store,
  sleep: async () => {},
};
const context = {
  userClient: async () => client,
  mediaDir: path.join(root, 'appstore', 'media', 'telegram'),
  home: root,
  reveal: async (folder) => revealed.push(folder),
};
const revealed = [];
const account = {
  ...createAccountData(env, context),
  ...createPhoneChange(env, context),
  stop: async () => {},
};

const { base, page, until, finish } = await openChatApp('account-data', {
  store,
  telegramAccount: account,
});

const faked = {
  profile: {
    ok: true,
    id: '7',
    firstName: 'Ann',
    lastName: 'Lee',
    about: '',
    username: 'annlee',
    phone: '+15551234567',
    hasPhoto: false,
    aboutMax: 70,
  },
  privacy: { ok: true, keys: [] },
  'privacy-ttl': { ok: true, period: 0 },
  'archive-settings': {
    ok: true,
    settings: {
      archiveAndMute: false,
      keepUnmuted: false,
      keepFolders: false,
      hideReadMarks: false,
      requirePremium: false,
    },
  },
  'web-sessions': { ok: true, sessions: [] },
  blocked: { ok: true, count: 0, items: [], next: null },
  sessions: { ok: true, ttlDays: 180, sessions: [] },
  security: {
    ok: true,
    password: {
      has: false,
      hint: '',
      hasRecovery: false,
      emailPending: false,
      emailPattern: '',
      resetPending: false,
    },
    accountTtlDays: 180,
    content: { enabled: false, canChange: false },
  },
};
for (const [name, answer] of Object.entries(faked)) {
  await page.route(`**/api/telegram/${name}`, (route) => fulfil(route, answer));
}
// Telegram's own deletion page, answered locally.
await page
  .context()
  .route('https://my.telegram.org/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: 'delete' })
  );

const profile = page.locator('[data-dialog="my-profile"]');
const phoneDialog = page.locator('[data-dialog="change-phone"]');
const privacy = page.locator('[data-dialog="privacy"]');
const exporter = page.locator('[data-dialog="data-export"]');
const gone = (locator, what) =>
  until(async () => (await locator.count()) === 0, what);
const field = (name) => phoneDialog.locator(`[data-field="${name}"]`);
const says = async (locator, words, what) =>
  until(async () => (await locator.textContent())?.includes(words), what);

const openProfile = async () => {
  if ((await page.locator('[data-action="my-profile"]').count()) === 0) {
    await page.locator('button[data-view="profile"]').click();
  }
  await page.locator('[data-action="my-profile"]').click();
  await profile.locator('[data-field="firstName"]').waitFor({ timeout: 5000 });
};

const phoneSteps = async () => {
  await page.goto(`${base}/`);
  await page.locator(`[data-chat="telegram:${CHAT}"]`).waitFor();
  await openProfile();
  await profile.locator('[data-action="change-phone"]').click();
  await phoneDialog.waitFor({ timeout: 5000 });
  assert(
    (
      await phoneDialog.locator('[data-phone="warning"]').textContent()
    ).includes('cloud data'),
    'the warning comes first'
  );
  // Escape closes only this dialog; the card stays.
  await page.keyboard.press('Escape');
  await gone(phoneDialog, 'Escape closes the phone dialog');
  assert((await profile.count()) === 1, 'the card stays');
  await profile.locator('[data-action="change-phone"]').click();
  await phoneDialog.locator('[data-action="submit"]').click();
  // A number Telegram refuses shows as text.
  hooks.phoneError = rpcError('PHONE_NUMBER_OCCUPIED');
  await field('new-phone').fill('+1 (555) 0009');
  await phoneDialog.locator('[data-action="submit"]').click();
  await says(phoneDialog.locator('[role="alert"]'), 'already used', 'occupied');
  hooks.phoneError = null;
  await phoneDialog.locator('[data-action="submit"]').click();
  await field('phone-code').waitFor({ timeout: 5000 });
  assert(
    log.phone[0].phoneNumber === '+15550009',
    `the number sent clean: ${log.phone[0].phoneNumber}`
  );
  hooks.changeError = rpcError('PHONE_CODE_INVALID');
  await field('phone-code').fill('11111');
  await phoneDialog.locator('[data-action="submit"]').click();
  await says(phoneDialog.locator('[role="alert"]'), 'not right', 'bad code');
  hooks.changeError = null;
  await field('phone-code').fill('12345');
  await phoneDialog.locator('[data-action="submit"]').click();
  await gone(phoneDialog, 'closed once changed');
  await profile.locator('[data-action="show-phone"]').click();
  await says(profile.locator('[data-field="phone"]'), '15550009', 'new phone');
  await page.keyboard.press('Escape');
  await gone(profile, 'the card closes');
};

const privacySteps = async () => {
  await openProfile();
  await profile.locator('[data-action="open-privacy"]').click();
  await privacy.waitFor({ timeout: 5000 });
  const select = privacy.locator('[data-field="account-ttl"]');
  await select.waitFor({ timeout: 5000 });
  const values = await select
    .locator('option')
    .evaluateAll((os) => os.map((o) => o.value));
  assert(
    JSON.stringify(values) ===
      JSON.stringify(['30', '90', '180', '365', '548', '730']),
    `the periods: ${values}`
  );
  const labels = await select
    .locator('option')
    .evaluateAll((os) => os.map((o) => o.textContent));
  assert(labels.at(-2) === '18 months', `18 months: ${labels.at(-2)}`);
  assert(labels.at(-1) === '2 years', `2 years: ${labels.at(-1)}`);
  const row = privacy.locator('[data-section="delete-account"]');
  assert(
    (await row.textContent()).includes('never deletes an account'),
    'the row explains'
  );
  const opened = page.context().waitForEvent('page');
  await row.locator('[data-action="delete-account"]').click();
  const tab = await opened;
  assert(
    tab.url().startsWith('https://my.telegram.org/delete'),
    `Telegram's page opens in a new tab: ${tab.url()}`
  );
  await tab.close();
  await page.keyboard.press('Escape');
  await gone(privacy, 'privacy closes');
  await page.keyboard.press('Escape');
  await gone(profile, 'the card closes');
};

const progress = (selector) => exporter.locator(selector);

const exportSteps = async () => {
  await profile.locator('[data-action="open-data-export"]').click();
  await exporter.waitFor({ timeout: 5000 });
  assert(
    (await exporter.locator('[data-option]').count()) === 8,
    'info, contacts, five kinds and media'
  );
  // Telegram may make the first export wait.
  hooks.initError = rpcError('TAKEOUT_INIT_DELAY_5400');
  await exporter.locator('[data-action="data-export-start"]').click();
  await says(
    exporter.locator('[role="alert"]'),
    'will allow the export in 1 hour 30 minutes',
    'the delay is told'
  );
  hooks.initError = null;
  await exporter.locator('[data-option="bots"]').check();
  await exporter.locator('[data-option="media"]').check();
  await exporter.locator('[data-field="format"]').selectOption('both');
  await exporter.locator('[data-action="data-export-start"]').click();
  await progress('[data-export="state"]').waitFor({ timeout: 5000 });
  await until(
    async () =>
      (await progress('[data-export="phase"]').textContent()).includes(
        'Chats:'
      ),
    'the chats are listed'
  );
  assert(log.init.length === 2, 'the session was opened');
  assert(
    log.init[1].files === true && log.init[1].messageUsers === true,
    'the flags follow the choices'
  );
  assert(
    (await progress('[data-export="phase"]').textContent()).includes('of 4'),
    'four chats: personal, bot, family and the private supergroup'
  );
  // Cancel stops it; what was saved stays and the session ends unsuccessfully.
  await exporter.locator('[data-action="data-export-cancel"]').click();
  release();
  await progress('[data-state="cancelled"]').waitFor({ timeout: 10_000 });
  assert(log.finished.at(-1).success === false, 'a cancelled session');
  await exporter.locator('[data-action="data-export-close"]').click();
  await gone(exporter, 'closed');
  // A second export runs to its end in a folder of its own.
  await profile.locator('[data-action="open-data-export"]').click();
  await exporter.locator('[data-action="data-export-start"]').click();
  await progress('[data-state="done"]').waitFor({ timeout: 10_000 });
  assert(
    (await progress('[data-export="folder"]').textContent()).includes(
      'DataExport_'
    ),
    'the folder the server chose is shown'
  );
  assert(
    log.finished.at(-1).success === true && log.bare.length === 0,
    'the session ended well and every request was wrapped'
  );
  await exporter.locator('[data-action="data-export-reveal"]').click();
  await until(() => revealed.length === 1, 'Show my data');
  await page.keyboard.press('Escape');
  await gone(exporter, 'Escape closes the export dialog');
};

await finish(async () => {
  await phoneSteps();
  await privacySteps();
  await openProfile();
  await exportSteps();
});
