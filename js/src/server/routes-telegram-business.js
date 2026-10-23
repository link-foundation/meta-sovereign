// Telegram Business (R-Y180): the routes of the POSTS table in
// routes-telegram.js, each validated strictly before the account is asked.
// Reads are free; every write is sent by the page only on Save or confirm.
//
// Its routes:
//   POST /api/telegram/business-hours {} -> { ok, hours, timezones } the
//                       user's opening hours and Telegram's time zones
//   POST /api/telegram/business-hours-set {timezone, weekly} -> { ok }
//                       weekly: [{start, end}] minutes from Monday 00:00
//                       (empty: cleared) (a write, on Save)
//   POST /api/telegram/business-location {} -> { ok, location }
//   POST /api/telegram/business-location-set {address, lat?, lon?} -> { ok }
//                       (a write, on Save; an empty address clears it)
//   POST /api/telegram/business-intro {} -> { ok, intro }
//   POST /api/telegram/business-intro-stickers {} -> { ok, stickers }
//   POST /api/telegram/business-intro-set {title, description, sticker?}
//                       -> { ok } (a write, on Save)
//   POST /api/telegram/business-profile {chat} -> { ok, hours, location,
//                       intro } what a person's profile shows
//   POST /api/telegram/business-links {} -> { ok, links }
//   POST /api/telegram/business-link-create {message, title?} -> { ok, link }
//   POST /api/telegram/business-link-edit {slug, message, title?} -> { ok,
//                       link }
//   POST /api/telegram/business-link-delete {slug} -> { ok }
//   POST /api/telegram/business-link-resolve {slug} -> { ok, chat, name,
//                       text } whose link it is and the text for the box
//   POST /api/telegram/business-bot {} -> { ok, bot } the connected bot
//   POST /api/telegram/business-bot-set {username, recipients, canReply}
//                       -> { ok, bot } (a write, on Save)
//   POST /api/telegram/business-bot-remove {} -> { ok } (on confirm)
//   POST /api/telegram/business-bot-chat {chat} -> { ok, bar } the bot
//                       managing a chat, or null
//   POST /api/telegram/business-bot-pause {chat, paused} -> { ok, paused }
//   POST /api/telegram/business-bot-disable {chat} -> { ok } (on confirm)
//   POST /api/telegram/folders-tags-set {enabled} -> { ok, enabled } shows
//                       folder tags on the chat list (Premium)

import { validWeekly, validZone } from '../sources/telegram-business.js';
import { SLUG, validLinkBody } from '../sources/telegram-business-links.js';
import { validRecipients } from '../sources/telegram-business-bots.js';

const USER = /^\d{1,20}$/;
const bad = (error) => [400, { error, code: 'bad-request' }];
const is = (body) => body && typeof body === 'object' && !Array.isArray(body);
const only = (body, keys) => Object.keys(body).every((k) => keys.includes(k));

const route = (method, valid, error) => async (account, body) =>
  is(body) && valid(body) && typeof account[method] === 'function'
    ? [200, await account[method](body)]
    : bad(error);

const none = (body) => Object.keys(body).length === 0;
const user = (body) => only(body, ['chat']) && USER.test(String(body.chat));
const slug = (body) => SLUG.test(String(body.slug ?? ''));
const number = (v) => typeof v === 'number' && Number.isFinite(v);

const validLocation = (b) =>
  only(b, ['address', 'lat', 'lon']) &&
  typeof b.address === 'string' &&
  b.address.length <= 400 &&
  (b.lat === undefined) === (b.lon === undefined) &&
  (b.lat === undefined ||
    (number(b.lat) &&
      number(b.lon) &&
      Math.abs(b.lat) <= 90 &&
      Math.abs(b.lon) <= 180));

const validIntro = (b) =>
  only(b, ['title', 'description', 'sticker']) &&
  typeof b.title === 'string' &&
  typeof b.description === 'string' &&
  b.title.length <= 200 &&
  b.description.length <= 400 &&
  (b.sticker === undefined ||
    b.sticker === null ||
    /^\d{1,20}$/.test(String(b.sticker)));

export const BUSINESS_POSTS = {
  'business-hours': route('businessHours', none, 'nothing expected'),
  'business-hours-set': route(
    'businessHoursSet',
    (b) =>
      only(b, ['timezone', 'weekly']) &&
      validZone(b.timezone) &&
      validWeekly(b.weekly),
    'a time zone and weekly hours required'
  ),
  'business-location': route('businessLocation', none, 'nothing expected'),
  'business-location-set': route(
    'businessLocationSet',
    validLocation,
    'an address and a point (both or neither) required'
  ),
  'business-intro': route('businessIntro', none, 'nothing expected'),
  'business-intro-stickers': route(
    'businessIntroStickers',
    none,
    'nothing expected'
  ),
  'business-intro-set': route(
    'businessIntroSet',
    validIntro,
    'a title and a description required'
  ),
  'business-profile': route('businessProfile', user, 'a person required'),
  'business-links': route('businessLinks', none, 'nothing expected'),
  'business-link-create': route(
    'businessLinkCreate',
    (b) => only(b, ['message', 'title']) && validLinkBody(b),
    'a message required'
  ),
  'business-link-edit': route(
    'businessLinkEdit',
    (b) => only(b, ['slug', 'message', 'title']) && slug(b) && validLinkBody(b),
    'a link and a message required'
  ),
  'business-link-delete': route(
    'businessLinkDelete',
    (b) => only(b, ['slug']) && slug(b),
    'a link required'
  ),
  'business-link-resolve': route(
    'businessLinkResolve',
    (b) => only(b, ['slug']) && slug(b),
    'a link required'
  ),
  'business-bot': route('businessBot', none, 'nothing expected'),
  'business-bot-set': route(
    'businessBotSet',
    (b) =>
      only(b, ['username', 'recipients', 'canReply']) &&
      typeof b.username === 'string' &&
      b.username.length <= 64 &&
      validRecipients(b.recipients) &&
      typeof b.canReply === 'boolean',
    'a username, recipients and canReply required'
  ),
  'business-bot-remove': route('businessBotRemove', none, 'nothing expected'),
  'business-bot-chat': route('businessBotChat', user, 'a person required'),
  'business-bot-pause': route(
    'businessBotPause',
    (b) =>
      only(b, ['chat', 'paused']) &&
      USER.test(String(b.chat)) &&
      typeof b.paused === 'boolean',
    'a person and paused required'
  ),
  'business-bot-disable': route(
    'businessBotDisable',
    user,
    'a person required'
  ),
  'folders-tags-set': route(
    'foldersTagsSet',
    (b) => only(b, ['enabled']) && typeof b.enabled === 'boolean',
    'enabled required'
  ),
};
