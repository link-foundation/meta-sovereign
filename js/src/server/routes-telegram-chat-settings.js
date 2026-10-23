// A group's and a channel's settings (R-Y165): the routes of the POSTS table
// in routes-telegram.js, each validated strictly before the account is asked.
//
// Its routes:
//   POST /api/telegram/chat-setting {chat, setting, value} -> { ok } one
//                       switch of the allow-list (signatures,
//                       signatureProfiles, joinToSend, joinRequest,
//                       hideMembers, antiSpam, noForwards), value a boolean
//   POST /api/telegram/discussion-groups {chat} -> { ok, groups } the
//                       supergroups a channel may be linked to
//   POST /api/telegram/discussion-set {chat, group|null} -> { ok } links a
//                       channel to a group, or unlinks it with null

import { validSetting } from '../sources/telegram-chat-settings.js';

const CHANNEL = /^-100\d{1,20}$/;
const BAD = [400, { error: 'invalid request', code: 'bad-request' }];

export const CHAT_SETTINGS_POSTS = {
  'chat-setting': async (account, body) =>
    validSetting(body) && typeof account.chatSettingSet === 'function'
      ? [
          200,
          await account.chatSettingSet({
            chat: body.chat,
            setting: body.setting,
            value: body.value,
          }),
        ]
      : BAD,
  'discussion-groups': async (account, body) =>
    CHANNEL.test(String(body.chat ?? '')) &&
    typeof account.discussionGroups === 'function'
      ? [200, await account.discussionGroups({ chat: body.chat })]
      : BAD,
  'discussion-set': async (account, body) =>
    CHANNEL.test(String(body.chat ?? '')) &&
    (body.group === null || CHANNEL.test(String(body.group ?? ''))) &&
    typeof account.discussionSet === 'function'
      ? [
          200,
          await account.discussionSet({ chat: body.chat, group: body.group }),
        ]
      : BAD,
};
