// A group's and channel's settings (R-Y165): the allow-list of switches,
// the discussion group, what the chat's info carries, the routes'
// validation, Telegram's errors, and the message menu honouring "Restrict
// saving content". Fake clients; nothing reaches a network.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  SETTING_KEYS,
  createChatSettings,
  settingsInfo,
  validSetting,
} from '../src/sources/telegram-chat-settings.js';
import { named, post } from './helpers/telegram-fakes.mjs';
import { isProtected, menuItems } from '../src/web/chat-selection.js';
import { noForwardsIn, settingValue } from '../src/web/chat-settings.js';

const Api = {
  channels: {
    ToggleSignatures: named('ToggleSignatures'),
    ToggleJoinToSend: named('ToggleJoinToSend'),
    ToggleJoinRequest: named('ToggleJoinRequest'),
    ToggleParticipantsHidden: named('ToggleParticipantsHidden'),
    ToggleAntiSpam: named('ToggleAntiSpam'),
    GetGroupsForDiscussion: named('GetGroupsForDiscussion'),
    SetDiscussionGroup: named('SetDiscussionGroup'),
  },
  messages: { ToggleNoForwards: named('ToggleNoForwards') },
  InputChannelEmpty: named('InputChannelEmpty'),
};

const make = ({ answer = true, fail = null } = {}) => {
  const log = [];
  const invoke = async (request) => {
    log.push(request);
    if (fail) {
      throw Object.assign(new Error(fail), { errorMessage: fail });
    }
    return typeof answer === 'function' ? answer(request) : answer;
  };
  const env = {
    importer: async () => ({ Api, helpers: { returnBigInt: BigInt } }),
    connection: { withPeer: async (_c, chat, use) => use({ chat }) },
  };
  return {
    ...createChatSettings(env, { userClient: async () => ({ invoke }) }),
    log,
  };
};

const CHANNEL = '-1001234';

test('each switch makes its own request', async () => {
  const cases = [
    ['signatures', true, 'ToggleSignatures', { signaturesEnabled: true }],
    ['signatureProfiles', true, 'ToggleSignatures', { profilesEnabled: true }],
    ['joinToSend', true, 'ToggleJoinToSend', { enabled: true }],
    ['joinRequest', false, 'ToggleJoinRequest', { enabled: false }],
    ['hideMembers', true, 'ToggleParticipantsHidden', { enabled: true }],
    ['antiSpam', true, 'ToggleAntiSpam', { enabled: true }],
  ];
  for (const [setting, value, name, fields] of cases) {
    const { chatSettingSet, log } = make();
    const out = await chatSettingSet({ chat: CHANNEL, setting, value });
    assert.deepEqual(out, { ok: true }, setting);
    assert.equal(log[0].className, name);
    assert.equal(log[0].channel.chat, CHANNEL);
    for (const [k, v] of Object.entries(fields)) {
      assert.equal(log[0][k], v, `${setting}.${k}`);
    }
  }
});

test('signatures off also turns the profiles off; profiles keep signatures on', async () => {
  const off = make();
  await off.chatSettingSet({
    chat: CHANNEL,
    setting: 'signatures',
    value: false,
  });
  assert.equal(off.log[0].signaturesEnabled, false);
  assert.equal(off.log[0].profilesEnabled, false);
  const prof = make();
  await prof.chatSettingSet({
    chat: CHANNEL,
    setting: 'signatureProfiles',
    value: true,
  });
  assert.equal(prof.log[0].signaturesEnabled, true);
});

test('restrict saving works on a group and a channel', async () => {
  for (const chat of ['-5', CHANNEL]) {
    const { chatSettingSet, log } = make();
    await chatSettingSet({ chat, setting: 'noForwards', value: true });
    assert.equal(log[0].className, 'ToggleNoForwards');
    assert.equal(log[0].peer.chat, chat);
    assert.equal(log[0].enabled, true);
  }
});

test('the allow-list is strict', async () => {
  assert.equal(SETTING_KEYS.length, 7);
  assert.equal(
    validSetting({ chat: CHANNEL, setting: 'signatures', value: true }),
    true
  );
  assert.equal(
    validSetting({ chat: '-5', setting: 'signatures', value: true }),
    false,
    'a basic group has no channel switches'
  );
  assert.equal(
    validSetting({ chat: '5', setting: 'noForwards', value: true }),
    false,
    'not a person'
  );
  assert.equal(
    validSetting({ chat: CHANNEL, setting: 'toString', value: true }),
    false
  );
  assert.equal(
    validSetting({ chat: CHANNEL, setting: 'antiSpam', value: 'yes' }),
    false
  );
  const { chatSettingSet, log } = make();
  const out = await chatSettingSet({
    chat: CHANNEL,
    setting: 'delete',
    value: true,
  });
  assert.equal(out.code, 'bad-request');
  assert.equal(log.length, 0);
});

test("Telegram's errors become words' codes", async () => {
  const codes = [
    ['PARTICIPANTS_TOO_FEW', 'too-few'],
    ['CHAT_ADMIN_REQUIRED', 'not-admin'],
    ['ANTISPAM_FUNCTION_MISSING', 'antispam-unavailable'],
    ['SOMETHING_ELSE', 'failed'],
  ];
  for (const [fail, code] of codes) {
    const { chatSettingSet } = make({ fail });
    const out = await chatSettingSet({
      chat: CHANNEL,
      setting: 'hideMembers',
      value: true,
    });
    assert.equal(out.ok, false);
    assert.equal(out.code, code);
  }
  const same = make({ fail: 'CHAT_NOT_MODIFIED' });
  assert.deepEqual(
    await same.chatSettingSet({
      chat: CHANNEL,
      setting: 'antiSpam',
      value: true,
    }),
    { ok: true }
  );
});

test('discussionGroups lists the supergroups with marked ids', async () => {
  const { discussionGroups, log } = make({
    answer: {
      chats: [
        { id: 77n, title: 'Chat A' },
        { id: { value: 78n }, title: 'Chat B' },
      ],
    },
  });
  const out = await discussionGroups({ chat: CHANNEL });
  assert.equal(log[0].className, 'GetGroupsForDiscussion');
  assert.deepEqual(out, {
    ok: true,
    groups: [
      { id: '-10077', title: 'Chat A' },
      { id: '-10078', title: 'Chat B' },
    ],
  });
  assert.equal((await discussionGroups({ chat: '-5' })).code, 'bad-request');
});

test('discussionSet links a group and unlinks with an empty channel', async () => {
  const link = make();
  assert.deepEqual(
    await link.discussionSet({ chat: CHANNEL, group: '-10077' }),
    { ok: true }
  );
  assert.equal(link.log[0].className, 'SetDiscussionGroup');
  assert.equal(link.log[0].broadcast.chat, CHANNEL);
  assert.equal(link.log[0].group.chat, '-10077');
  const unlink = make();
  await unlink.discussionSet({ chat: CHANNEL, group: null });
  assert.equal(unlink.log[0].group.className, 'InputChannelEmpty');
  assert.equal(
    (await unlink.discussionSet({ chat: CHANNEL, group: '5' })).code,
    'bad-request'
  );
  assert.equal(
    (await unlink.discussionSet({ chat: '-5', group: null })).code,
    'bad-request'
  );
  const hidden = make({ fail: 'MEGAGROUP_PREHISTORY_HIDDEN' });
  assert.equal(
    (await hidden.discussionSet({ chat: CHANNEL, group: '-10077' })).code,
    'prehistory-hidden'
  );
});

test('settingsInfo: who sees which switch, and the values', () => {
  const channel = settingsInfo({
    broadcast: true,
    adminRights: { changeInfo: true },
    signatures: true,
  });
  assert.deepEqual(channel.shown, ['signatures', 'discussion']);
  assert.equal(channel.values.signatures, true);
  const owner = settingsInfo({
    broadcast: true,
    creator: true,
    noforwards: true,
  });
  assert.deepEqual(owner.shown, ['signatures', 'discussion', 'noForwards']);
  assert.equal(owner.values.noForwards, true);
  const privateGroup = settingsInfo({
    megagroup: true,
    adminRights: { changeInfo: true },
  });
  assert.deepEqual(privateGroup.shown, ['hideMembers', 'antiSpam']);
  const publicGroup = settingsInfo(
    {
      megagroup: true,
      username: 'g',
      adminRights: { changeInfo: true },
      joinToSend: true,
    },
    { participantsHidden: true, antispam: true }
  );
  assert.deepEqual(publicGroup.shown, [
    'joinToSend',
    'joinRequest',
    'hideMembers',
    'antiSpam',
  ]);
  assert.equal(publicGroup.values.hideMembers, true);
  assert.equal(publicGroup.values.antiSpam, true);
  const linked = settingsInfo(
    { megagroup: true, creator: true },
    { linkedChatId: 9n },
    [{ id: 9n, title: 'News' }]
  );
  assert.ok(linked.shown.includes('joinToSend'));
  assert.deepEqual(linked.linked, { id: '-1009', title: 'News' });
  assert.deepEqual(
    settingsInfo({ megagroup: true, adminRights: { banUsers: true } }).shown,
    [],
    'a plain admin sees none'
  );
  assert.deepEqual(settingsInfo({ megagroup: true }).shown, []);
  assert.deepEqual(settingsInfo({ className: 'Chat', creator: true }).shown, [
    'noForwards',
  ]);
});

test('the routes validate strictly', async () => {
  const calls = [];
  const account = {
    chatSettingSet: async (a) => (calls.push(['set', a]), { ok: true }),
    discussionGroups: async (a) => (
      calls.push(['groups', a]),
      { ok: true, groups: [] }
    ),
    discussionSet: async (a) => (calls.push(['link', a]), { ok: true }),
  };
  const good = await post(
    'chat-setting',
    { chat: CHANNEL, setting: 'antiSpam', value: true },
    account
  );
  assert.equal(good.status, 200);
  for (const body of [
    { chat: CHANNEL, setting: 'antiSpam', value: 1 },
    { chat: CHANNEL, setting: 'nope', value: true },
    { chat: '12', setting: 'noForwards', value: true },
  ]) {
    assert.equal((await post('chat-setting', body, account)).status, 400);
  }
  assert.equal(
    (await post('discussion-groups', { chat: CHANNEL }, account)).status,
    200
  );
  assert.equal(
    (await post('discussion-groups', { chat: '-5' }, account)).status,
    400
  );
  assert.equal(
    (await post('discussion-set', { chat: CHANNEL, group: null }, account))
      .status,
    200
  );
  assert.equal(
    (await post('discussion-set', { chat: CHANNEL, group: '-10077' }, account))
      .status,
    200
  );
  assert.equal(
    (await post('discussion-set', { chat: CHANNEL }, account)).status,
    400
  );
  assert.equal(
    (await post('discussion-set', { chat: CHANNEL, group: 'x' }, account))
      .status,
    400
  );
  assert.equal(calls.length, 4);
});

const chat = {
  source: 'telegram',
  chat: '-1005',
  key: 'telegram:-1005',
  kind: 'group',
};
const theirs = {
  id: 'm1',
  source: 'telegram',
  body: 'hi',
  sender: '31',
  raw: { id: 1 },
};
const info = (noForwards) => ({
  settings: { shown: [], values: { noForwards } },
});
const LEAVES = ['forward', 'copy', 'saveAs', 'copyImage', 'copySelected'];

test('a chat with noforwards: others messages lose Forward, Copy and Save as', () => {
  assert.equal(noForwardsIn(chat, info(true)), true);
  assert.equal(noForwardsIn(chat, info(false)), false);
  assert.equal(settingValue('-1005', info(true), 'noForwards'), true);
  const open = menuItems({
    message: theirs,
    chat,
    info: info(false),
    target: { photo: true },
  });
  assert.ok(open.includes('forward') && open.includes('copyImage'));
  const shut = menuItems({
    message: theirs,
    chat,
    info: info(true),
    selectedText: 'hi',
    target: { photo: true },
  });
  for (const key of LEAVES) {
    assert.ok(!shut.includes(key), `no ${key}`);
  }
  assert.ok(shut.includes('quoteReply') && shut.includes('delete'));
  const mine = { ...theirs, sender: 'me' };
  assert.ok(
    menuItems({ message: mine, chat, info: info(true) }).includes('forward'),
    'own messages stay'
  );
});

test('a message with its own noforwards flag is protected anywhere', () => {
  const flagged = { ...theirs, sender: 'me', raw: { id: 2, noforwards: true } };
  assert.equal(isProtected(flagged, chat, info(false)), true);
  const items = menuItems({ message: flagged, chat, info: info(false) });
  assert.ok(!items.includes('forward') && !items.includes('copy'));
});

test('selected messages: no Copy or Forward when copying is forbidden', () => {
  const selection = {
    ids: ['m1'],
    has: () => true,
    canForward: false,
    canCopy: false,
  };
  const items = menuItems({ message: theirs, chat, selection, order: ['m1'] });
  assert.ok(
    !items.includes('copySelectedItems') && !items.includes('forwardSelected')
  );
  assert.ok(items.includes('deleteSelected'));
});
