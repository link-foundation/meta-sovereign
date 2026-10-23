// Sharing a place and a contact (R-Y142): the routes of the POSTS table in
// routes-telegram.js, each validated strictly before the account is asked.

import { validSendAs } from '../sources/telegram-send-as-client.js';
import { validSchedule } from '../sources/telegram-scheduled.js';
import {
  LIVE_PERIODS,
  MAX_ACCURACY,
  cleanPhone,
  validPoint,
} from '../sources/telegram-share-media.js';

const CHAT = /^-?\d{1,20}$/;
const USER = /^\d{1,20}$/;
const NAME_MAX = 64;

const optionalOk = (body) =>
  (body.silent === undefined || typeof body.silent === 'boolean') &&
  (body.scheduleDate === undefined || validSchedule(body.scheduleDate)) &&
  (body.clientId === undefined || typeof body.clientId === 'string') &&
  validSendAs(body.sendAs) &&
  (body.replyTo === undefined ||
    (Number.isInteger(body.replyTo) && body.replyTo > 0));

// Without sound, at a time, an answer to, a draft's id.
const extrasOf = (body) => ({
  ...(body.silent === true ? { silent: true } : {}),
  ...(body.scheduleDate !== undefined
    ? { scheduleDate: body.scheduleDate }
    : {}),
  ...(body.replyTo ? { replyTo: body.replyTo } : {}),
  ...(body.clientId ? { clientId: body.clientId } : {}),
  ...(body.sendAs ? { sendAs: body.sendAs } : {}),
});

const validPlace = (b) =>
  CHAT.test(String(b.chat ?? '')) &&
  typeof b.lat === 'number' &&
  typeof b.lon === 'number' &&
  validPoint(b.lat, b.lon) !== null &&
  (b.accuracy === undefined ||
    (Number.isInteger(b.accuracy) &&
      b.accuracy >= 0 &&
      b.accuracy <= MAX_ACCURACY)) &&
  (b.live === undefined || LIVE_PERIODS.includes(b.live)) &&
  optionalOk(b);

const nameOk = (value, required) =>
  typeof value === 'string' &&
  value.length <= NAME_MAX &&
  (!required || value.trim() !== '');

// A picked contact (its id) or a typed one (names and a phone).
const validContact = (b) =>
  CHAT.test(String(b.chat ?? '')) &&
  optionalOk(b) &&
  (b.contact !== undefined
    ? USER.test(String(b.contact)) &&
      b.phone === undefined &&
      b.firstName === undefined
    : nameOk(b.firstName, true) &&
      (b.lastName === undefined || nameOk(b.lastName, false)) &&
      cleanPhone(b.phone) !== null);

// The moving point of a live place: a place with the message's id.
const validMove = (b) =>
  validPlace({ ...b, live: undefined }) &&
  Number.isInteger(b.id) &&
  b.id > 0 &&
  (b.heading === undefined ||
    (typeof b.heading === 'number' && Number.isFinite(b.heading)));

const refuse = (what) => [400, { error: what, code: 'bad-request' }];

export const SHARE_POSTS = {
  'send-location': async (account, body) =>
    validPlace(body) && typeof account.sendLocation === 'function'
      ? [
          200,
          await account.sendLocation({
            chat: String(body.chat),
            lat: body.lat,
            lon: body.lon,
            ...(body.accuracy ? { accuracy: body.accuracy } : {}),
            ...(body.live ? { live: body.live } : {}),
            ...extrasOf(body),
          }),
        ]
      : refuse('a valid place required'),
  'stop-live-location': async (account, body) =>
    CHAT.test(String(body.chat ?? '')) &&
    Number.isInteger(body.id) &&
    body.id > 0 &&
    typeof account.stopLiveLocation === 'function'
      ? [
          200,
          await account.stopLiveLocation({
            chat: String(body.chat),
            id: body.id,
          }),
        ]
      : refuse('chat and id required'),
  // The moving point of our live location (R-Y147).
  'update-live-location': async (account, body) =>
    validMove(body) && typeof account.updateLiveLocation === 'function'
      ? [
          200,
          await account.updateLiveLocation({
            chat: String(body.chat),
            id: body.id,
            lat: body.lat,
            lon: body.lon,
            ...(body.accuracy ? { accuracy: body.accuracy } : {}),
            ...(body.heading === undefined ? {} : { heading: body.heading }),
          }),
        ]
      : refuse('chat, id and a valid place required'),
  'send-contact': async (account, body) =>
    validContact(body) && typeof account.sendContact === 'function'
      ? [
          200,
          await account.sendContact({
            chat: String(body.chat),
            ...(body.contact === undefined
              ? {
                  firstName: body.firstName.trim(),
                  lastName: (body.lastName ?? '').trim(),
                  phone: body.phone,
                }
              : { contact: String(body.contact) }),
            ...extrasOf(body),
          }),
        ]
      : refuse('a contact required'),
};
