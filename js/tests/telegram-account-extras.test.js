// Archive settings, logged-in websites and pinned Saved Messages chats
// (R-Y174): the settings read and written with the fields the page does
// not show kept, Telegram's PREMIUM_ACCOUNT_REQUIRED as a code, the
// websites listed and disconnected, the pin toggled, the routes'
// validation and the page's pure helpers. Fake clients; no network.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  ARCHIVE_FIELDS,
  createAccountExtras,
  settingsOf,
} from '../src/sources/telegram-account-extras.js';
import { pinnedFirst } from '../src/web/chat-saved.js';
import {
  fakeClient,
  helpers,
  named,
  post,
  telegramError,
} from './helpers/telegram-fakes.mjs';

const Api = {
  GlobalPrivacySettings: named('GlobalPrivacySettings'),
  InputDialogPeer: named('InputDialogPeer'),
  account: {
    GetGlobalPrivacySettings: named('GetGlobalPrivacySettings'),
    SetGlobalPrivacySettings: named('SetGlobalPrivacySettings'),
    GetWebAuthorizations: named('GetWebAuthorizations'),
    ResetWebAuthorization: named('ResetWebAuthorization'),
    ResetWebAuthorizations: named('ResetWebAuthorizations'),
  },
  messages: { ToggleSavedDialogPin: named('ToggleSavedDialogPin') },
};

const make = (answer) => {
  const log = [];
  const env = {
    importer: async () => ({ Api, helpers }),
    connection: { withPeer: async (_c, chat, use) => use({ chat }) },
  };
  const actions = createAccountExtras(env, {
    userClient: async () => fakeClient(answer, log),
  });
  return { actions, log };
};

const FIVE = {
  archiveAndMute: true,
  keepUnmuted: false,
  keepFolders: true,
  hideReadMarks: false,
  requirePremium: false,
};

test('every Api name the module uses is in layer 225', () => {
  const tl = readFileSync(
    new URL('../src/sources/telegram-api/layer-225.tl', import.meta.url),
    'utf8'
  );
  for (const method of [
    'account.getGlobalPrivacySettings',
    'account.setGlobalPrivacySettings',
    'account.getWebAuthorizations',
    'account.resetWebAuthorization',
    'account.resetWebAuthorizations',
    'messages.toggleSavedDialogPin',
  ]) {
    assert.ok(tl.includes(`\n${method}#`), method);
  }
  assert.ok(tl.includes('\nglobalPrivacySettings#'));
  assert.ok(tl.includes('\ninputDialogPeer#'));
  for (const field of Object.values(ARCHIVE_FIELDS)) {
    const snake = field.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
    assert.ok(tl.includes(` ${snake}:flags.`), field);
  }
});

test('archiveSettings reads the five switches', async () => {
  const { actions } = make(() => ({
    archiveAndMuteNewNoncontactPeers: true,
    keepArchivedFolders: true,
    noncontactPeersPaidStars: 5n,
  }));
  assert.deepEqual(await actions.archiveSettings(), {
    ok: true,
    settings: FIVE,
  });
  assert.deepEqual(settingsOf(null), {
    archiveAndMute: false,
    keepUnmuted: false,
    keepFolders: false,
    hideReadMarks: false,
    requirePremium: false,
  });
});

test('setArchiveSettings sends all fields and keeps the unseen ones', async () => {
  const gifts = { className: 'DisallowedGiftsSettings' };
  const { actions, log } = make((request) =>
    request.className === 'GetGlobalPrivacySettings'
      ? {
          displayGiftsButton: true,
          noncontactPeersPaidStars: 7n,
          disallowedGifts: gifts,
          hideReadMarks: true,
        }
      : request.settings
  );
  const wrote = await actions.setArchiveSettings(FIVE);
  assert.equal(wrote.ok, true);
  assert.deepEqual(wrote.settings, FIVE);
  const set = log.find((r) => r.className === 'SetGlobalPrivacySettings');
  assert.equal(set.settings.className, 'GlobalPrivacySettings');
  assert.equal(set.settings.displayGiftsButton, true);
  assert.equal(set.settings.noncontactPeersPaidStars, 7n);
  assert.equal(set.settings.disallowedGifts, gifts);
  assert.equal(set.settings.hideReadMarks, false, 'the page decides these');
  assert.equal(set.settings.archiveAndMuteNewNoncontactPeers, true);
});

test('setArchiveSettings: bad requests are refused, Premium is a code', async () => {
  const { actions, log } = make((request) =>
    request.className === 'GetGlobalPrivacySettings'
      ? {}
      : telegramError('PREMIUM_ACCOUNT_REQUIRED')
  );
  assert.equal((await actions.setArchiveSettings({})).code, 'bad-request');
  assert.equal(
    (await actions.setArchiveSettings({ ...FIVE, keepFolders: 1 })).code,
    'bad-request'
  );
  assert.equal(log.length, 0, 'nothing was asked');
  const refused = await actions.setArchiveSettings(FIVE);
  assert.equal(refused.ok, false);
  assert.equal(refused.code, 'premium-required');
});

test('webSessions lists the sites with their bot', async () => {
  const { actions } = make(() => ({
    authorizations: [
      {
        hash: 123n,
        botId: 9n,
        domain: 'example.org',
        browser: 'Firefox',
        platform: 'Linux',
        ip: '1.2.3.4',
        region: 'Berlin',
        dateCreated: 1_700_000_000,
        dateActive: 1_700_003_600,
      },
    ],
    users: [{ id: 9n, firstName: 'Login Bot', username: 'loginbot' }],
  }));
  const answer = await actions.webSessions();
  assert.equal(answer.ok, true);
  assert.deepEqual(answer.sessions, [
    {
      hash: '123',
      domain: 'example.org',
      bot: 'Login Bot',
      botUsername: 'loginbot',
      browser: 'Firefox',
      platform: 'Linux',
      ip: '1.2.3.4',
      region: 'Berlin',
      created: new Date(1_700_000_000_000).toISOString(),
      active: new Date(1_700_003_600_000).toISOString(),
    },
  ]);
});

test('web sessions are disconnected one or all', async () => {
  const { actions, log } = make(() => true);
  assert.equal(
    (await actions.webSessionReset({ hash: 'x' })).code,
    'bad-request'
  );
  assert.equal(log.length, 0);
  assert.equal((await actions.webSessionReset({ hash: '-77' })).ok, true);
  assert.equal(log[0].className, 'ResetWebAuthorization');
  assert.equal(log[0].hash, -77n);
  assert.equal((await actions.webSessionsResetAll()).ok, true);
  assert.equal(log[1].className, 'ResetWebAuthorizations');
});

test('savedPin pins and unpins one chat of Saved Messages', async () => {
  const { actions, log } = make(() => true);
  assert.equal((await actions.savedPin({ peer: '5' })).code, 'bad-request');
  assert.equal((await actions.savedPin({ pinned: true })).code, 'bad-request');
  assert.equal((await actions.savedPin({ peer: '5', pinned: true })).ok, true);
  assert.equal(log[0].pinned, true);
  assert.equal(log[0].peer.className, 'InputDialogPeer');
  assert.deepEqual(log[0].peer.peer, { chat: '5' });
  await actions.savedPin({ peer: '-1005', pinned: false });
  assert.equal(log[1].pinned, undefined, 'unpin sends no pinned flag');
});

test('the routes validate before asking', async () => {
  const calls = [];
  const account = new Proxy(
    {},
    {
      get: (_t, name) => async (arg) => {
        calls.push([name, arg]);
        return { ok: true };
      },
    }
  );
  const status = async (route, body) =>
    (await post(route, body, account)).status;
  assert.equal(await status('archive-settings', {}), 200);
  assert.equal(await status('archive-settings-set', FIVE), 200);
  assert.equal(
    await status('archive-settings-set', { ...FIVE, hideReadMarks: 'x' }),
    400
  );
  assert.equal(
    await status('archive-settings-set', { keepFolders: true }),
    400
  );
  assert.equal(await status('web-sessions', {}), 200);
  assert.equal(await status('web-session-reset', { hash: '12' }), 200);
  assert.equal(await status('web-session-reset', { hash: 'a' }), 400);
  assert.equal(await status('web-sessions-reset-all', {}), 200);
  assert.equal(await status('saved-pin', { peer: '7', pinned: true }), 200);
  assert.equal(await status('saved-pin', { peer: '7', pinned: 'yes' }), 400);
  assert.equal(await status('saved-pin', { pinned: true }), 400);
  assert.equal(calls.length, 6, 'only the valid ones were asked');
  assert.equal((await post('web-sessions', {}, {})).status, 400);
});

test('the page puts pinned chats first and keeps the order otherwise', () => {
  const list = [
    { peer: '1', pinned: false },
    { peer: '2', pinned: true },
    { peer: '3', pinned: false },
    { peer: '4', pinned: true },
  ];
  assert.deepEqual(
    pinnedFirst(list).map((d) => d.peer),
    ['2', '4', '1', '3']
  );
});
