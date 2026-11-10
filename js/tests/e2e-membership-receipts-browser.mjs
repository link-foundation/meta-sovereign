import { assert, openChatApp } from './helpers/e2e-chat.mjs';
import {
  membershipFixture,
  memberUpdates,
} from './helpers/telegram-membership.mjs';
import { TUTORIAL_STORAGE_KEY, TUTORIAL_VERSION } from '../src/web/tutorial.js';

const f = await membershipFixture((request) => {
  if (request.className === 'messages.CheckChatInvite') {
    return {
      className: 'ChatInvitePeek',
      chat: memberUpdates().chats[0],
      expires: 2_000_000_000,
    };
  }
  if (request.hash === 'PendingHash12') {
    throw Object.assign(new Error('INVITE_REQUEST_SENT'), {
      errorMessage: 'INVITE_REQUEST_SENT',
    });
  }
  if (request.hash === 'UnknownHash12') {
    return undefined;
  }
  return {
    className: 'messages.ChatInviteJoinResultWebView',
    botId: 1n,
    queryId: 5n,
  };
});
const { page, base, finish } = await openChatApp('membership-receipts', {
  store: f.store,
  telegramAccount: {
    ...f.actions,
    status: async () => ({
      connected: true,
      kind: 'user',
      account: { username: 'owner' },
    }),
    callsList: async () => ({ ok: true, calls: [], next: null }),
    stop: async () => {},
  },
});
page.setDefaultTimeout(10000);
await page.addInitScript(
  ({ key, version }) => {
    globalThis.localStorage.setItem(
      key,
      JSON.stringify({ off: true, v: version })
    );
    globalThis.localStorage.setItem('metaSovereignLocale', 'en');
  },
  { key: TUTORIAL_STORAGE_KEY, version: TUTORIAL_VERSION }
);
await finish(async () => {
  await page.goto(`${base}/#/automation`);
  await page.locator('[data-follow-chats-panel]').waitFor();
  for (const [hash, text] of [
    ['PeekHash1234', 'This invite requires a bot web view.'],
    ['UnknownHash12', 'Telegram did not confirm the result.'],
    ['PendingHash12', 'Your request to join was sent.'],
  ]) {
    const before = f.calls.filter(
      (r) => r.className === 'messages.ImportChatInvite'
    ).length;
    await page.evaluate(
      (value) =>
        globalThis.dispatchEvent(
          new globalThis.CustomEvent('ms-invite-open', {
            detail: { hash: value },
          })
        ),
      hash
    );
    const dialog = page.locator('[data-dialog="invite"]');
    await dialog.getByText('Study circle', { exact: true }).waitFor();
    assert(
      f.calls.filter((r) => r.className === 'messages.ImportChatInvite')
        .length === before,
      'preview never joins'
    );
    assert(
      page.url().endsWith('/#/automation'),
      'peek never navigates as a member'
    );
    await dialog.locator('[data-action="join"]').evaluate((button) => {
      button.click();
      button.click();
    });
    await dialog.getByRole('alert').filter({ hasText: text }).waitFor();
    assert(
      (await dialog.locator('[data-action="join"]').count()) === 0,
      'unconfirmed result cannot repeat the write'
    );
    assert(
      f.calls.filter((r) => r.className === 'messages.ImportChatInvite')
        .length ===
        before + 1,
      'one confirmed write'
    );
    assert(
      page.url().endsWith('/#/automation'),
      'unconfirmed join never navigates'
    );
    await dialog.locator('[data-action="cancel"]').click();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() =>
    globalThis.dispatchEvent(
      new globalThis.CustomEvent('ms-invite-open', {
        detail: { hash: 'PeekHash1234' },
      })
    )
  );
  await page.locator('[data-dialog="invite"] [data-action="join"]').click();
  await page.locator('[data-dialog="invite"]').getByRole('alert').waitFor();
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= globalThis.innerWidth
    ),
    'membership guidance fits a phone'
  );
});
