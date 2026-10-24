// Managing a channel or group (R-Y216): the routes of the POSTS table in
// routes-telegram.js, each validated strictly before the account is asked.
// The source validates again; this keeps junk off the account. Deleting a
// chat for everyone is `remove-chat` with the action `destroy`.
//
// Its routes:
//   POST /api/telegram/channel-username-check {chat, username} -> { ok,
//                       status } whether the public link is free, or a
//                       code: invalid, taken, too-many-public (R-Y216)
//   POST /api/telegram/channel-username-save {chat, username} -> { ok } the
//                       public link set; '' makes the chat private
//   POST /api/telegram/public-channels {} -> { ok, channels } the user's
//                       public channels, for "Revoke link"
//   POST /api/telegram/public-link-revoke {chat} -> { ok } one of them
//                       made private
//   POST /api/telegram/usernames-deactivate {chat} -> { ok } every
//                       collectible username of the chat deactivated
//   POST /api/telegram/channel-color-save {chat, forProfile, color?, emoji?}
//                       -> { ok } the name or profile colour (boosts needed)
//   POST /api/telegram/channel-emoji-status {chat, documentId, until?} ->
//                       { ok } the channel's emoji status (null removes it)
//   POST /api/telegram/inactive-channels {} -> { ok, channels } channels the
//                       user could leave when there are too many
//   POST /api/telegram/leave-channels {chats} -> { ok, left } the chosen
//                       inactive channels left

import { route } from './routes-telegram-admin-extras.js';

const CHANNEL = /^-100\d{1,20}$/;
const NAME = /^[A-Za-z][A-Za-z0-9_]{3,30}[A-Za-z0-9]$/;
const DIGITS = /^\d{1,20}$/;
const MAX_LEAVE = 100;

const channelOf = (b) => CHANNEL.test(String(b.chat ?? ''));
const nameOf = (b) => typeof b.username === 'string' && NAME.test(b.username);
const WHAT = 'chat required';

export const CHANNEL_MANAGE_POSTS = {
  'channel-username-check': route(
    'channelUsernameCheck',
    'chat and username required',
    (b) => channelOf(b) && nameOf(b)
  ),
  'channel-username-save': route(
    'channelUsernameSave',
    'chat and username required',
    (b) => channelOf(b) && (b.username === '' || nameOf(b))
  ),
  'public-channels': route('publicChannels', WHAT, () => true),
  'public-link-revoke': route('publicLinkRevoke', WHAT, channelOf),
  'usernames-deactivate': route('usernamesDeactivate', WHAT, channelOf),
  'channel-color-save': route(
    'channelColorSave',
    'chat and colour required',
    (b) =>
      channelOf(b) &&
      typeof b.forProfile === 'boolean' &&
      (b.color === undefined || Number.isInteger(b.color)) &&
      (b.emoji === undefined || DIGITS.test(String(b.emoji)))
  ),
  'channel-emoji-status': route(
    'channelEmojiStatusSet',
    'chat and status required',
    (b) =>
      channelOf(b) &&
      (b.documentId === null || DIGITS.test(String(b.documentId))) &&
      (b.until === undefined || Number.isInteger(b.until))
  ),
  'inactive-channels': route('inactiveChannels', WHAT, () => true),
  'leave-channels': route(
    'leaveChannels',
    'chats required',
    (b) =>
      Array.isArray(b.chats) &&
      b.chats.length > 0 &&
      b.chats.length <= MAX_LEAVE &&
      b.chats.every((x) => CHANNEL.test(String(x)))
  ),
};
