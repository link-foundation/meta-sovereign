// Profile extras (R-Y178): the routes of the POSTS table in
// routes-telegram.js, each validated strictly before the account is asked.
// Every write is a click on Save in the page.
//
// Its routes:
//   POST /api/telegram/profile-extras {} -> { ok, premium, birthday, color,
//                       profileColor, personalChannel } the user's own
//   POST /api/telegram/birthday-save {day, month, year?} | {remove: true}
//                       -> { ok } the user's birthday (a write)
//   POST /api/telegram/profile-colors {} -> { ok, name, profile } the
//                       palettes Telegram offers: { id, colors, dark? }
//   POST /api/telegram/color-save {forProfile, color?, emoji?} -> { ok }
//                       the name or profile colour; neither removes it
//                       (a write, Premium)
//   POST /api/telegram/personal-channels {} -> { ok, channels } the user's
//                       public channels that can be shown on the profile
//   POST /api/telegram/personal-channel-save {chat} | {remove: true}
//                       -> { ok } the profile's channel (a write)
//   POST /api/telegram/personal-channel {chat} -> { ok, card } a person's
//                       personal channel with its latest post, or null
//   POST /api/telegram/contact-birthdays {} -> { ok, birthdays } contacts
//                       whose birthday is today or within a week

import {
  validBirthday,
  MAX_COLOR,
} from '../sources/telegram-profile-extras.js';

const bad = (error) => [400, { error, code: 'bad-request' }];
const route = (method, valid, error) => async (account, body) =>
  valid(body) && typeof account[method] === 'function'
    ? [200, await account[method](body)]
    : bad(error);

const isRemove = (b) => b.remove === true && Object.keys(b).length === 1;

export const PROFILE_EXTRAS_POSTS = {
  'profile-extras': route('profileExtras', () => true, 'bad request'),
  'birthday-save': route(
    'birthdaySave',
    (b) => isRemove(b) || validBirthday(b),
    'a day and month (and a year), or remove, required'
  ),
  'profile-colors': route('profileColors', () => true, 'bad request'),
  'color-save': route(
    'colorSave',
    (b) =>
      typeof b.forProfile === 'boolean' &&
      (b.color === undefined ||
        (Number.isInteger(b.color) && b.color >= 0 && b.color <= MAX_COLOR)) &&
      (b.emoji === undefined || /^\d{1,20}$/.test(String(b.emoji))),
    'forProfile and a colour required'
  ),
  'personal-channels': route('personalChannels', () => true, 'bad request'),
  'personal-channel-save': route(
    'personalChannelSave',
    (b) => isRemove(b) || /^-100\d{1,20}$/.test(String(b.chat ?? '')),
    'a channel, or remove, required'
  ),
  'personal-channel': route(
    'personalChannelCard',
    (b) => /^\d{1,20}$/.test(String(b.chat ?? '')),
    'a person required'
  ),
  'contact-birthdays': route('contactBirthdays', () => true, 'bad request'),
};
