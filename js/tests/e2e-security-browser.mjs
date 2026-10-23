// Real browser e2e for the security extras of Privacy and Security
// (R-Y177), as Telegram Desktop's Settings has them: two-step verification
// (set with a hint and a recovery email whose code is asked in the dialog,
// change and remove asking the current password), the account's "If away
// for" period, "Disable filtering" for sensitive content, and per session
// "Accept secret chats" / "Accept calls" and "Terminate old sessions
// after". Every write is sent only by a Save or confirm click; the
// passwords are gone from the page once sent and never reach the browser's
// storage. Telegram's answers faked in the page, a fake chat in a memory
// store, a server on a free port, a headless browser; nothing reaches a
// network or a running app. Not part of `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:security

import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const CHAT = '5';
const SECRET = 'correct-Horse-9';
const NEXT = 'battery-Staple-7';
const store = createMemoryStore();
await store.put({
  ...{ id: `msg:telegram:${CHAT}:1`, source: 'telegram', chat: CHAT },
  ...{ chatName: 'Some Friend', senderName: 'Some Friend' },
  ...{ chatType: 'private', sender: CHAT, body: 'hi', raw: { id: 1 } },
  timestamp: new Date(Date.now() - 60_000).toISOString(),
});

const { base, page, until, finish } = await openChatApp('security', { store });

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
await page.route('**/api/telegram/privacy', (route) =>
  fulfil(route, { ok: true, keys: [] })
);
await page.route('**/api/telegram/privacy-ttl', (route) =>
  fulfil(route, { ok: true, period: 0 })
);
await page.route('**/api/telegram/archive-settings', (route) =>
  fulfil(route, {
    ok: true,
    settings: {
      archiveAndMute: false,
      keepUnmuted: false,
      keepFolders: false,
      hideReadMarks: false,
      requirePremium: false,
    },
  })
);
await page.route('**/api/telegram/web-sessions', (route) =>
  fulfil(route, { ok: true, sessions: [] })
);
await page.route('**/api/telegram/blocked', (route) =>
  fulfil(route, { ok: true, count: 0, items: [], next: null })
);
const session = (hash, extra = {}) => ({
  hash,
  current: false,
  official: false,
  pending: false,
  secretChats: true,
  calls: true,
  device: 'Pixel 8',
  platform: 'Android',
  system: '14',
  app: 'Telegram Android',
  appVersion: '10.1',
  ip: '1.2.3.4',
  country: 'NL',
  region: 'NH',
  created: '2026-01-01T10:00:00.000Z',
  active: '2026-01-02T10:00:00.000Z',
  ...extra,
});
await page.route('**/api/telegram/sessions', (route) =>
  fulfil(route, {
    ok: true,
    ttlDays: 180,
    sessions: [
      session('1', { current: true, device: 'This Mac' }),
      session('2'),
    ],
  })
);

// The security state Telegram holds, and each write.
const held = {
  password: {
    has: false,
    hint: '',
    hasRecovery: false,
    emailPending: false,
    emailPattern: '',
    resetPending: false,
  },
  accountTtlDays: 180,
  content: { enabled: false, canChange: true },
};
await page.route('**/api/telegram/security', (route) =>
  fulfil(route, { ok: true, ...held })
);
const sent = [];
const record = (name, reply) => async (route) => {
  const body = route.request().postDataJSON() ?? {};
  sent.push([name, body]);
  return fulfil(route, typeof reply === 'function' ? reply(body) : reply);
};
let sets = 0;
await page.route(
  '**/api/telegram/password-set',
  record('password-set', (body) => {
    sets += 1;
    if (sets === 1) {
      // The recovery email needs its code before the password counts.
      return {
        ok: false,
        error: 'EMAIL_UNCONFIRMED',
        code: 'email-unconfirmed',
        codeLength: 6,
      };
    }
    if (sets === 2) {
      return { ok: false, error: 'x', code: 'wrong-password' };
    }
    held.password.hint = body.hint ?? '';
    return { ok: true };
  })
);
await page.route(
  '**/api/telegram/password-email-confirm',
  record('password-email-confirm', () => {
    Object.assign(held.password, {
      has: true,
      hint: 'a pet',
      hasRecovery: true,
    });
    return { ok: true };
  })
);
await page.route(
  '**/api/telegram/password-remove',
  record('password-remove', () => {
    Object.assign(held.password, { has: false, hint: '', hasRecovery: false });
    return { ok: true };
  })
);
await page.route(
  '**/api/telegram/account-ttl-set',
  record('account-ttl-set', (body) => ({ ok: true, days: body.days }))
);
await page.route(
  '**/api/telegram/sensitive-set',
  record('sensitive-set', (body) => ({ ok: true, enabled: body.enabled }))
);
await page.route(
  '**/api/telegram/session-settings',
  record('session-settings', (body) => ({
    ok: true,
    secretChats: body.secretChats,
    calls: body.calls,
  }))
);
await page.route(
  '**/api/telegram/session-ttl-set',
  record('session-ttl-set', (body) => ({ ok: true, days: body.days }))
);

const dialog = page.locator('[data-dialog="privacy"]');
const field = (name) => dialog.locator(`[data-field="two-step-${name}"]`);
const action = (name) => dialog.locator(`[data-action="${name}"]`);
const sessionRow = (hash) => dialog.locator(`[data-session="${hash}"]`);
const writes = (name) => sent.filter(([n]) => n === name);
const says = (text, what) =>
  until(async () => (await dialog.textContent()).includes(text), what);

const openSteps = async () => {
  await page.goto(`${base}/`);
  await page.locator(`[data-chat="telegram:${CHAT}"]`).waitFor();
  await page.locator('[data-action="my-profile"]').click();
  await page.locator('[data-action="open-privacy"]').click();
  await action('password-open-set').waitFor({ timeout: 5000 });
  assert(
    (await dialog.locator('[data-two-step]').getAttribute('data-two-step')) ===
      'false',
    'two-step verification is off'
  );
  assert(
    (await dialog.textContent()).includes('Two-step verification is off'),
    'the off line'
  );
};

const setSteps = async () => {
  await action('password-open-set').click();
  await field('password').fill(SECRET);
  await field('repeat').fill(`${SECRET}x`);
  await action('password-save').click();
  await says('The two passwords differ', 'a mismatch is told');
  assert(sent.length === 0, 'nothing sent for a mismatch');
  await field('repeat').fill(SECRET);
  await field('hint').fill(`${SECRET} again`);
  await action('password-save').click();
  await says('must not contain the password', 'a hint with the password');
  assert(sent.length === 0, 'nothing sent for such a hint');
  await field('hint').fill('a pet');
  await field('email').fill('ann@example.org');
  // Enter in a field sends this panel only, never closes the dialog.
  await field('email').press('Enter');
  await until(() => writes('password-set').length === 1, 'the set request');
  assert(
    JSON.stringify(writes('password-set')[0][1]) ===
      JSON.stringify({
        password: SECRET,
        hint: 'a pet',
        email: 'ann@example.org',
      }),
    `set body: ${JSON.stringify(writes('password-set')[0][1])}`
  );
  // The email's code is asked in the dialog; the passwords are gone.
  await field('code').waitFor({ timeout: 5000 });
  assert((await field('password').count()) === 0, 'the password field is gone');
  await action('password-code-confirm').waitFor();
  assert(
    (await action('password-code-confirm').isDisabled()) === true,
    'no confirm without a code'
  );
  await field('code').fill('123456');
  await action('password-code-confirm').click();
  await until(() => writes('password-email-confirm').length === 1, 'confirm');
  assert(
    JSON.stringify(writes('password-email-confirm')[0][1]) ===
      JSON.stringify({ code: '123456' }),
    'the code sent'
  );
  await dialog.locator('[data-two-step="true"]').waitFor({ timeout: 5000 });
  const text = await dialog.textContent();
  assert(
    text.includes('Two-step verification is on') &&
      text.includes('Hint: a pet') &&
      text.includes('A recovery email is set'),
    `status shown: ${text.slice(0, 200)}`
  );
};

const changeSteps = async () => {
  await action('password-open-change').click();
  await field('password').fill(NEXT);
  await field('repeat').fill(NEXT);
  await action('password-save').click();
  await says('Enter the current password', 'the current one is asked');
  assert(writes('password-set').length === 1, 'nothing sent without it');
  await field('current').fill('wrong-one');
  await action('password-save').click();
  await until(() => writes('password-set').length === 2, 'the change request');
  await says('The password is wrong', 'a wrong password is told in words');
  assert(
    writes('password-set')[1][1].current === 'wrong-one',
    'the current password went with the change'
  );
  await field('current').fill(SECRET);
  await action('password-save').click();
  await until(() => writes('password-set').length === 3, 'the retry');
  await says('Saved.', 'saved');
  assert((await field('password').count()) === 0, 'the form closed');
};

const removeSteps = async () => {
  await action('password-open-remove').click();
  await action('password-save').click();
  await says('Enter the current password', 'the current one is asked');
  assert(writes('password-remove').length === 0, 'nothing sent without it');
  await field('current').fill(NEXT);
  await action('password-save').click();
  await until(() => writes('password-remove').length === 1, 'remove');
  assert(
    JSON.stringify(writes('password-remove')[0][1]) ===
      JSON.stringify({ current: NEXT }),
    'the current password sent to remove'
  );
  await action('password-open-set').waitFor({ timeout: 5000 });
};

const ttlSteps = async () => {
  const select = dialog.locator('[data-field="account-ttl"]');
  assert((await select.inputValue()) === '180', 'six months shown');
  await select.selectOption('365');
  assert(writes('account-ttl-set').length === 0, 'nothing sent before Save');
  await action('account-ttl-save').click();
  await until(() => writes('account-ttl-set').length === 1, 'ttl request');
  assert(
    JSON.stringify(writes('account-ttl-set')[0][1]) ===
      JSON.stringify({ days: 365 }),
    'twelve months sent as days'
  );
  await action('account-ttl-save').waitFor({ state: 'detached' });
};

const sensitiveSteps = async () => {
  const box = dialog.locator('[data-field="sensitive"]');
  await box.check();
  assert(writes('sensitive-set').length === 0, 'nothing sent before Save');
  await action('sensitive-save').click();
  await until(() => writes('sensitive-set').length === 1, 'sensitive request');
  assert(
    JSON.stringify(writes('sensitive-set')[0][1]) ===
      JSON.stringify({ enabled: true }),
    'filtering disabled sent'
  );
};

const sessionSteps = async () => {
  await sessionRow('2').waitFor();
  const secret = sessionRow('2').locator('[data-field="session-secretChats"]');
  assert(await secret.isChecked(), 'secret chats accepted at first');
  await secret.uncheck();
  assert(writes('session-settings').length === 0, 'nothing sent before Save');
  await sessionRow('2')
    .locator('[data-action="session-settings-save"]')
    .click();
  await until(() => writes('session-settings').length === 1, 'session save');
  assert(
    JSON.stringify(writes('session-settings')[0][1]) ===
      JSON.stringify({ hash: '2', secretChats: false, calls: true }),
    `session body: ${JSON.stringify(writes('session-settings')[0][1])}`
  );
  const old = dialog.locator('[data-field="session-ttl"]');
  assert((await old.inputValue()) === '180', 'six months of inactivity shown');
  await old.selectOption('30');
  assert(writes('session-ttl-set').length === 0, 'nothing sent before Save');
  await action('session-ttl-save').click();
  await until(() => writes('session-ttl-set').length === 1, 'session ttl');
  assert(
    JSON.stringify(writes('session-ttl-set')[0][1]) ===
      JSON.stringify({ days: 30 }),
    'thirty days sent'
  );
};

const leakSteps = async () => {
  const page_ = await page.evaluate(() => ({
    text: document.body.innerText,
    values: [...document.querySelectorAll('input')].map((i) => i.value),
    local: JSON.stringify({ ...window.localStorage }),
    session: JSON.stringify({ ...window.sessionStorage }),
  }));
  for (const secret of [SECRET, NEXT, 'wrong-one']) {
    const all = JSON.stringify(page_);
    assert(!all.includes(secret), `a password is still in the page: ${secret}`);
  }
};

await finish(async () => {
  await openSteps();
  await setSteps();
  await changeSteps();
  await removeSteps();
  await ttlSteps();
  await sensitiveSteps();
  await sessionSteps();
  await leakSteps();
});
