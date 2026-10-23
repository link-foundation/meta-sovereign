// Notification settings (R-Y157): the routes of the POSTS table in
// routes-telegram.js, each validated strictly before the account is asked.
//
// Its routes:
//   POST /api/telegram/notify-settings -> { ok, scopes: { users, chats,
//                       broadcasts: { on, previews, stories } }, exceptions:
//                       [{ chat, name, scope, state, muteUntil, forever,
//                       previews }] } Settings → Notifications (R-Y157)
//   POST /api/telegram/notify-settings-set {scope, on?, previews?, stories?}
//                       -> { ok, scope, on, previews, stories }
//   POST /api/telegram/notify-chat {chat} -> { ok, exception, muteUntil,
//                       forever, previews, stories, sound } a chat's own
//                       settings; sound 'default' | 'none' | a ringtone id
//   POST /api/telegram/notify-chat-set {chat, mute?, previews?, sound?,
//                       reset?} mute 'off' | 'forever' | seconds; previews
//                       'default' | 'on' | 'off'; sound 'default' | 'none'
//                       | a saved ringtone's id (R-Y181); reset: follow the
//                       global

import {
  validChatChange,
  validScopeChange,
} from '../sources/telegram-notify-settings.js';

const CHAT = /^-?\d{1,20}$/;
const bad = (error) => [400, { error, code: 'bad-request' }];

export const NOTIFY_SETTINGS_POSTS = {
  'notify-settings': async (account) =>
    typeof account.notifyOverview === 'function'
      ? [200, await account.notifyOverview()]
      : bad('not supported'),
  'notify-settings-set': async (account, body) =>
    validScopeChange(body) && typeof account.notifyScopeSet === 'function'
      ? [
          200,
          await account.notifyScopeSet({
            scope: body.scope,
            on: body.on,
            previews: body.previews,
            stories: body.stories,
          }),
        ]
      : bad('scope and a change required'),
  'notify-chat': async (account, body) =>
    CHAT.test(String(body.chat ?? '')) &&
    typeof account.notifyChat === 'function'
      ? [200, await account.notifyChat({ chat: String(body.chat) })]
      : bad('chat required'),
  'notify-chat-set': async (account, body) =>
    validChatChange(body) && typeof account.notifyChatSet === 'function'
      ? [
          200,
          await account.notifyChatSet({
            chat: String(body.chat),
            mute: body.mute,
            previews: body.previews,
            sound: body.sound === undefined ? undefined : String(body.sound),
            reset: body.reset,
          }),
        ]
      : bad('chat and a change required'),
};
