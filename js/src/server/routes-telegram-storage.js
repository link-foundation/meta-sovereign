// Local storage management, reaction notifications, resetting the
// notification settings and Telegram's automatic-download preset (R-Y215):
// the routes of the POSTS table in routes-telegram.js, each validated
// strictly before the account is asked.
//
// Its routes:
//   POST /api/telegram/storage-usage {} -> { ok, total, kinds, chats,
//                       limits } the media cache by kind (photos, videos,
//                       voice, files, stickers, other) and by chat
//   POST /api/telegram/storage-clear {kind} | {all: true} -> { ok,
//                       removed: { bytes, files } } only files inside the
//                       media cache are removed
//   POST /api/telegram/storage-limits {} -> { ok, maxGb, olderDays }
//   POST /api/telegram/storage-limits-set {maxGb, olderDays} -> { ok, ...,
//                       removed } maxGb 0, 1, 5 or 20; olderDays 0, 7, 30
//                       or 365 (0 is none); applied at once
//   POST /api/telegram/reaction-notify {} -> { ok, messages, stories,
//                       previews, sound } who is told of reactions
//                       ('nobody', 'contacts', 'all')
//   POST /api/telegram/reaction-notify-set {messages?, stories?, previews?,
//                       sound?} -> the same row
//   POST /api/telegram/notify-reset {} -> { ok } every notification
//                       setting back to Telegram's default
//   POST /api/telegram/auto-download-preset {} -> { ok, medium: {
//                       disabled, photoMax, videoMax, fileMax } } bytes

import { validClear, validLimits } from '../sources/telegram-storage.js';
import { validReactionChange } from '../sources/telegram-notify-extras.js';
import { route } from './routes-telegram-admin-extras.js';

const anyone = () => true;
const nothing = () => ({});

export const STORAGE_POSTS = {
  'storage-usage': route('storageUsage', 'not supported', anyone, nothing),
  'storage-clear': route(
    'storageClear',
    'a kind or all required',
    validClear,
    (b) => (b.all === true ? { all: true } : { kind: b.kind })
  ),
  'storage-limits': route('storageLimits', 'not supported', anyone, nothing),
  'storage-limits-set': route(
    'storageLimitsSet',
    'maxGb and olderDays required',
    validLimits,
    (b) => ({ maxGb: b.maxGb, olderDays: b.olderDays })
  ),
  'reaction-notify': route(
    'reactionNotifyGet',
    'not supported',
    anyone,
    nothing
  ),
  'reaction-notify-set': route(
    'reactionNotifySet',
    'a change required',
    validReactionChange,
    (b) => ({
      messages: b.messages,
      stories: b.stories,
      previews: b.previews,
      sound: b.sound,
    })
  ),
  'notify-reset': route('notifyResetAll', 'not supported', anyone, nothing),
  'auto-download-preset': route(
    'autoDownloadPreset',
    'not supported',
    anyone,
    nothing
  ),
};
