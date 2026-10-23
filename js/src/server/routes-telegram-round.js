// A recorded round video to send (R-Y150): the route of the POSTS table
// in routes-telegram.js, validated strictly before the account is asked.
//
// Its routes:
//   POST /api/telegram/send-round {chat, token, duration, size?,
//                                  replyTo?}
//                                      -> { ok, ids } a recorded clip
//                                         as a round video (R-Y150)

import {
  MAX_ROUND_SECONDS,
  MAX_ROUND_SIDE,
} from '../sources/telegram-round.js';
import { paidField, validSendAs } from '../sources/telegram-send-as-client.js';
import { validSchedule } from '../sources/telegram-scheduled.js';

const inRange = (v, min, max) => Number.isFinite(v) && v >= min && v <= max;

/** Whether `body` is a round video to send. */
export const validRound = (body) =>
  typeof body.chat === 'string' &&
  /^-?\d{1,20}$/.test(body.chat) &&
  typeof body.token === 'string' &&
  /^[a-f0-9]{32}$/.test(body.token) &&
  inRange(body.duration, 0, MAX_ROUND_SECONDS + 1) &&
  (body.size === undefined ||
    (Number.isInteger(body.size) && inRange(body.size, 1, MAX_ROUND_SIDE))) &&
  validSendAs(body.sendAs) &&
  (body.scheduleDate === undefined || validSchedule(body.scheduleDate));

export const ROUND_POSTS = {
  'send-round': async (account, body) => {
    const replyTo = Number(body.replyTo);
    if (!validRound(body) || typeof account.sendRound !== 'function') {
      return [
        400,
        { error: 'chat, token and duration required', code: 'bad-request' },
      ];
    }
    return [
      200,
      await account.sendRound({
        chat: body.chat,
        token: body.token,
        duration: body.duration,
        size: body.size,
        replyTo: Number.isInteger(replyTo) && replyTo > 0 ? replyTo : null,
        ...(body.sendAs === undefined ? {} : { sendAs: body.sendAs }),
        ...paidField(body),
        ...(body.silent === true ? { silent: true } : {}),
        ...(body.scheduleDate !== undefined
          ? { scheduleDate: body.scheduleDate }
          : {}),
      }),
    ];
  },
};
