/**
 * VK scroll-back (R-Z20), a user action from the page:
 *
 *   POST /api/vk/history {chat, before?, captchaSid?, captchaKey?}
 *     -> { ok, imported, complete }
 *        or { ok: false, error, code } with `code` one of bad-request |
 *        not-connected | rate-limited (HTTP 429) | captcha (HTTP 409, plus
 *        `captcha: { sid, img }` -- `img` only when it is on VK's own API
 *        host) | the network's own code.
 *
 * `chat` is the VK peer id, `before` the VK id of the oldest message the
 * page holds. A captcha is shown to the user by the page, which repeats
 * this request once with `captchaSid` and `captchaKey`; the program never
 * solves one, and pulls in the background never ask (they back off and mark
 * the connection as needing attention: ../sources/pull-runner.js).
 */

import { fail, json, readBody } from './util.js';
import { isTrustedMutation } from './routes-auto-import.js';
import { safeMessage } from './redact.js';
import { vkCaptchaImage } from '../sources/vk-hosts.js';

const PEER = /^-?\d{1,15}$/;
const MESSAGE = /^\d{1,12}$/;
const SID = /^[\w.-]{1,64}$/;
const KEY = /^\S{1,32}$/;
const STATUS = { 'rate-limited': 429, captcha: 409, 'not-connected': 409 };

const text = (value) => (value === undefined ? undefined : String(value));

/** The checked request, or a message saying what is wrong. */
export const historyRequest = (body) => {
  const peerId = text(body.chat);
  if (!PEER.test(peerId ?? '') || Number(peerId) === 0) {
    return { error: 'a VK chat id is needed' };
  }
  const before = text(body.before);
  if (before !== undefined && !MESSAGE.test(before)) {
    return { error: '"before" must be a VK message id' };
  }
  const sid = text(body.captchaSid);
  const key = text(body.captchaKey);
  if ((sid === undefined) !== (key === undefined)) {
    return { error: 'captchaSid and captchaKey go together' };
  }
  if (sid !== undefined && !(SID.test(sid) && KEY.test(key))) {
    return { error: 'the captcha answer is not valid' };
  }
  return { peerId, before, captchaSid: sid, captchaKey: key };
};

const failure = (res, error) => {
  const code = error.code ?? 'failed';
  const captcha =
    code === 'captcha'
      ? {
          captcha: {
            sid: error.captchaSid ?? null,
            img: error.captchaImg ? vkCaptchaImage(error.captchaImg) : null,
          },
        }
      : {};
  return (
    json(res, STATUS[code] ?? 502, {
      ok: false,
      error: safeMessage(error),
      code,
      ...captcha,
    }) ?? true
  );
};

export const handleVkRoutes = async (req, res, p, ctx) => {
  if (p !== '/api/vk/history' || req.method !== 'POST') {
    return false;
  }
  if (!isTrustedMutation(req, ctx.allowOrigins)) {
    return fail(res, 403, 'forbidden', 'use the meta-sovereign app') ?? true;
  }
  const request = historyRequest(await readBody(req));
  if (request.error) {
    return fail(res, 400, 'bad-request', request.error) ?? true;
  }
  if (!ctx.vkInbox) {
    return fail(res, 404, 'unsupported', 'VK is not enabled') ?? true;
  }
  try {
    const done = await ctx.vkInbox.older(request);
    return json(res, 200, { ok: true, ...done }) ?? true;
  } catch (error) {
    return failure(res, error);
  }
};
