// Real browser e2e for the remaining Privacy and Security items (R-Y218),
// as the official clients have them: the login email (masked, changed with
// a code mailed to the new address, errors in words), "Forgot password?"
// beside the current password (a recovery email's code, or "Reset password"
// with its wait date, and "Cancel reset request" while one is pending),
// passkeys (listed, deleted behind a confirmation, added with the
// browser's WebAuthn, stubbed here), and the sign-in code safety: a message
// holding a fresh login code from 777000 is asked about first, and the code
// is invalidated only when the user sends anyway. Telegram's answers faked
// in the page, a fake chat in a memory store, a server on a free port, a
// headless browser; nothing reaches a network or a running app. Not part of
// `npm test`; run it with:
//
//   RUN_BROWSER_E2E=1 npm run test:e2e:security-extras

import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';

const CHAT = '5';
const LOGIN = '48151';
const store = createMemoryStore();
await store.put({
  ...{ id: `msg:telegram:${CHAT}:1`, source: 'telegram', chat: CHAT },
  ...{ chatName: 'Some Friend', senderName: 'Some Friend' },
  ...{ chatType: 'private', sender: CHAT, body: 'hi', raw: { id: 1 } },
  timestamp: new Date(Date.now() - 60_000).toISOString(),
});

const drafts = [];
const send = async (draft) => (drafts.push(draft), { via: 'fake' });
const { base, page, until, finish } = await openChatApp('security-extras', {
  store,
  send,
});

// A browser whose WebAuthn is a stub that remembers what it was asked.
await page.addInitScript(() => {
  const create = async (options) => {
    globalThis.__passkeyAsked = {
      challenge: [...new Uint8Array(options.publicKey.challenge)],
      user: [...new Uint8Array(options.publicKey.user.id)],
    };
    return {
      id: 'cred-1',
      rawId: Uint8Array.from([1, 2, 3]).buffer,
      response: {
        clientDataJSON: new TextEncoder().encode('{"type":"webauthn.create"}')
          .buffer,
        attestationObject: Uint8Array.from([250, 251]).buffer,
      },
    };
  };
  const none = globalThis.localStorage.getItem('no-passkeys') === '1';
  Object.defineProperty(globalThis.navigator, 'credentials', {
    value: none ? undefined : { create },
    configurable: true,
  });
});

const quiet = {
  profile: {
    ok: true,
    ...{ id: '7', firstName: 'Ann', lastName: 'Lee', about: '' },
    ...{ username: 'annlee', phone: '+15551234567', hasPhoto: false },
    aboutMax: 70,
  },
  privacy: { ok: true, keys: [] },
  'privacy-ttl': { ok: true, period: 0 },
  'web-sessions': { ok: true, sessions: [] },
  blocked: { ok: true, count: 0, items: [], next: null },
  sessions: { ok: true, ttlDays: 180, sessions: [] },
  'archive-settings': {
    ok: true,
    settings: { archiveAndMute: false, keepUnmuted: false },
  },
};
for (const [name, body] of Object.entries(quiet)) {
  await page.route(`**/api/telegram/${name}`, (route) => fulfil(route, body));
}

// What Telegram holds, and each call the page made.
const held = {
  password: {
    ...{ has: true, hint: '', hasRecovery: true, emailPending: false },
    ...{ emailPattern: '', resetPending: false, resetDate: null },
    loginEmail: 'a***@x.org',
  },
  accountTtlDays: 180,
  content: { enabled: false, canChange: false },
};
const passkeys = [
  ...[{ id: 'k1', name: 'Work Mac', created: '2026-01-01T10:00:00.000Z' }],
  {
    id: 'k2',
    name: 'Phone',
    created: '2026-02-01T10:00:00.000Z',
    lastUsed: '2026-02-02T10:00:00.000Z',
  },
];
const calls = [];
const answers = {
  security: () => ({ ok: true, ...held }),
  passkeys: () => ({ ok: true, passkeys }),
  'passkey-options': () => ({
    ok: true,
    options: JSON.stringify({
      publicKey: {
        challenge: 'AQID',
        rp: { name: 'Telegram' },
        user: { id: 'BwA', name: 'ann', displayName: 'Ann' },
      },
    }),
  }),
  'sign-in-codes': () => ({ ok: true, codes: [LOGIN] }),
  'login-email-verify': () => ({ ok: true, email: 'new@x.org' }),
  'passkey-delete': (body) => {
    passkeys.splice(
      passkeys.findIndex((p) => p.id === body.id),
      1
    );
    return { ok: true };
  },
  'passkey-register': () => {
    passkeys.push({
      id: 'k3',
      name: 'This browser',
      created: '2026-03-01T10:00:00.000Z',
    });
    return { ok: true, passkey: passkeys.at(-1) };
  },
  'recovery-request': () => ({ ok: true, pattern: 'm***@x.org' }),
  'password-reset': () => {
    Object.assign(held.password, {
      resetPending: true,
      resetDate: '2026-12-01T10:00:00.000Z',
    });
    return { ok: true, result: 'wait', until: held.password.resetDate };
  },
  'password-reset-cancel': () => {
    Object.assign(held.password, { resetPending: false, resetDate: null });
    return { ok: true };
  },
};
let emailSends = 0;
answers['login-email-send'] = () =>
  (emailSends += 1) === 1
    ? { ok: false, error: 'EMAIL_NOT_ALLOWED', code: 'email-not-allowed' }
    : { ok: true, pattern: 'n***@x.org', length: 5 };
for (const name of [
  ...Object.keys(answers),
  'recovery-confirm',
  'invalidate-codes',
]) {
  await page.route(`**/api/telegram/${name}`, (route) => {
    const body = route.request().postDataJSON() ?? {};
    if (name !== 'security' && name !== 'passkeys') {
      calls.push([name, body]);
    }
    return fulfil(route, answers[name]?.(body) ?? { ok: true });
  });
}

const dialog = page.locator('[data-dialog="privacy"]');
const over = (name) => page.locator(`[data-dialog="${name}"]`);
const action = (name) => dialog.locator(`[data-action="${name}"]`);
const made = (name) => calls.filter(([n]) => n === name);
const says = (box, text, what) =>
  until(async () => (await box.textContent()).includes(text), what);
const submit = (name) => over(name).locator('[data-action="submit"]').click();

const open = async () => {
  await page.goto(`${base}/`);
  await page.locator(`[data-chat="telegram:${CHAT}"]`).waitFor();
  await page.locator('[data-action="my-profile"]').click();
  await page.locator('[data-action="open-privacy"]').click();
  await dialog.locator('[data-login-email]').waitFor({ timeout: 5000 });
};

const loginEmailSteps = async () => {
  assert(
    (await dialog.locator('[data-login-email]').textContent()).includes(
      'a***@x.org'
    ),
    'the masked login email shown'
  );
  await action('login-email-change').click();
  const box = over('login-email');
  const email = box.locator('[data-field="login-email"]');
  await email.fill('not-an-address');
  assert(
    await box.locator('[data-action="submit"]').isDisabled(),
    'no send for a bad address'
  );
  await email.fill('new@x.org');
  await submit('login-email');
  await says(box, 'not allowed', 'the refusal in words');
  assert(made('login-email-send').length === 1, 'one send so far');
  await submit('login-email');
  const code = box.locator('[data-field="login-email-code"]');
  await code.waitFor({ timeout: 5000 });
  assert(
    made('login-email-send')[1][1].email === 'new@x.org',
    'the address sent'
  );
  await code.fill(LOGIN);
  await submit('login-email');
  await until(() => made('login-email-verify').length === 1, 'the verify call');
  assert(made('login-email-verify')[0][1].code === LOGIN, 'the code sent');
  await box.waitFor({ state: 'detached' });
  await says(dialog, 'The login email was changed', 'the note');
};

const forgotSteps = async () => {
  await action('password-open-change').click();
  await action('forgot-password').click();
  const box = over('forgot-password');
  await says(box, 'recovery email', 'the recovery text');
  await submit('forgot-password');
  await box.locator('[data-field="recovery-code"]').waitFor({ timeout: 5000 });
  assert(made('recovery-request').length === 1, 'the recovery code asked');
  assert(
    (await box.textContent()).includes('m***@x.org'),
    'the masked address'
  );
  // Escape closes only the top dialog.
  await page.keyboard.press('Escape');
  await box.waitFor({ state: 'detached' });
  assert(await dialog.isVisible(), 'the privacy dialog stays');
  await action('forgot-password').click();
  await submit('forgot-password');
  await box.locator('[data-field="recovery-code"]').fill(LOGIN);
  await submit('forgot-password');
  await until(() => made('recovery-confirm').length === 1, 'the confirm call');
  assert(
    made('recovery-confirm')[0][1].code === LOGIN,
    'the recovery code sent'
  );
  await says(box, 'The password was removed', 'the result');
  held.password.hasRecovery = false;
  await submit('forgot-password');
  await box.waitFor({ state: 'detached' });
  // No recovery email: Reset password, then Cancel reset request.
  await action('password-open-change').click();
  await action('forgot-password').click();
  await says(box, 'no recovery email', 'the reset text');
  await submit('forgot-password');
  await says(box, 'Reset requested', 'the wait date told');
  await submit('forgot-password');
  await dialog.locator('[data-reset-pending]').waitFor({ timeout: 5000 });
  await action('reset-cancel').click();
  await page.keyboard.press('Escape');
  await over('reset-cancel').waitFor({ state: 'detached' });
  assert(made('password-reset-cancel').length === 0, 'Escape cancels nothing');
  await action('reset-cancel').click();
  await submit('reset-cancel');
  await until(
    () => made('password-reset-cancel').length === 1,
    'the cancel call'
  );
  await dialog.locator('[data-reset-pending]').waitFor({ state: 'detached' });
};

const passkeySteps = async () => {
  const rows = dialog.locator('[data-passkey]');
  await until(async () => (await rows.count()) === 2, 'two passkeys');
  const text = await rows.nth(0).textContent();
  assert(
    text.includes('Work Mac') && text.includes('Never used'),
    `first row: ${text}`
  );
  assert(
    (await rows.nth(1).textContent()).includes('Last used'),
    'last used shown'
  );
  await rows.nth(0).locator('[data-action="passkey-delete"]').click();
  await page.keyboard.press('Escape');
  await over('passkey-delete').waitFor({ state: 'detached' });
  assert(made('passkey-delete').length === 0, 'Escape deletes nothing');
  await rows.nth(0).locator('[data-action="passkey-delete"]').click();
  await submit('passkey-delete');
  await until(() => made('passkey-delete').length === 1, 'the delete call');
  assert(made('passkey-delete')[0][1].id === 'k1', 'the right passkey');
  await until(async () => (await rows.count()) === 1, 'one passkey left');
  await action('passkey-add').click();
  await until(() => made('passkey-register').length === 1, 'the register call');
  const body = made('passkey-register')[0][1];
  assert(
    JSON.stringify(body) ===
      JSON.stringify({
        id: 'cred-1',
        rawId: 'AQID',
        clientData: '{"type":"webauthn.create"}',
        attestation: '-vs',
      }),
    `register body: ${JSON.stringify(body)}`
  );
  const asked = await page.evaluate(() => globalThis.__passkeyAsked);
  assert(
    JSON.stringify(asked) ===
      JSON.stringify({ challenge: [1, 2, 3], user: [7, 0] }),
    `options as bytes: ${JSON.stringify(asked)}`
  );
  await until(async () => (await rows.count()) === 2, 'the new passkey listed');
};

const signInCodeSteps = async () => {
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'detached' });
  await page.keyboard.press('Escape');
  await over('my-profile').waitFor({ state: 'detached' });
  await page.locator(`[data-chat="telegram:${CHAT}"]`).click();
  const box = page.locator('.chat-composer textarea');
  await box.fill('hello there');
  await box.press('Enter');
  await until(() => drafts.length === 1, 'a plain message is sent');
  assert(
    (await over('sign-in-code').count()) === 0,
    'no question for plain text'
  );
  await box.fill(`my code is ${LOGIN}`);
  await box.press('Enter');
  const ask = over('sign-in-code');
  await ask.waitFor({ timeout: 5000 });
  await page.keyboard.press('Escape');
  await ask.waitFor({ state: 'detached' });
  await page.waitForTimeout(300);
  assert(drafts.length === 1, 'cancelled: nothing sent');
  assert(
    made('invalidate-codes').length === 0,
    'cancelled: nothing invalidated'
  );
  await box.fill(`code ${LOGIN} ok`);
  await box.press('Enter');
  await ask.waitFor({ timeout: 5000 });
  await submit('sign-in-code');
  await until(() => drafts.length === 2, 'sent after confirming');
  assert(
    JSON.stringify(made('invalidate-codes')[0][1]) ===
      JSON.stringify({ codes: [LOGIN] }),
    'the code invalidated'
  );
};

const unsupportedSteps = async () => {
  await page.evaluate(() =>
    globalThis.localStorage.setItem('no-passkeys', '1')
  );
  await open();
  await says(dialog, 'cannot create passkeys', 'the unsupported text');
  assert((await action('passkey-add').count()) === 0, 'no Add passkey button');
};

await finish(async () => {
  await open();
  await loginEmailSteps();
  await forgotSteps();
  await passkeySteps();
  await signInCodeSteps();
  await unsupportedSteps();
});
