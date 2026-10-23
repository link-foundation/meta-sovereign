/**
 * Ownership of a chat, as Telegram Desktop's edit dialog has it (R-Y200;
 * learned, never copied):
 * - `convertToGigagroup({ chat, confirm })` — the supergroup becomes a
 *   broadcast group where only admins write (channels.convertToGigagroup);
 *   cannot be undone, so `confirm: true` is required;
 * - `transferOwnership({ chat, user, password })` — the chat handed to a
 *   member (messages.editChatCreator, layer 225's call for groups and
 *   channels) with the 2-Step Verification password checked by the
 *   `telegram` package's SRP helper (`computeCheck`). The password lives
 *   only in the request in memory: never logged, stored, put into an error
 *   or answered. PASSWORD_MISSING, PASSWORD_TOO_FRESH_* and
 *   SESSION_TOO_FRESH_* come back as codes (with `waitSeconds`).
 * Telegram's errors become codes the page shows as text.
 */

import { inputPeerOf } from './telegram-members.js';
import { connected, failureOf, runIn } from './telegram-stickers.js';

const CODES = {
  CHAT_ADMIN_REQUIRED: 'not-admin',
  USER_NOT_PARTICIPANT: 'not-member',
  USER_ID_INVALID: 'not-member',
  MEGAGROUP_REQUIRED: 'not-supergroup',
  PARTICIPANTS_TOO_FEW: 'too-few',
  CHANNEL_PRIVATE: 'no-access',
  CHANNEL_INVALID: 'no-access',
  PASSWORD_MISSING: 'password-missing',
  PASSWORD_TOO_FRESH_: 'password-fresh',
  SESSION_TOO_FRESH_: 'session-fresh',
  PASSWORD_HASH_INVALID: 'password-wrong',
  SRP_PASSWORD_CHANGED: 'srp-invalid',
  SRP_ID_INVALID: 'srp-invalid',
  CHANNELS_ADMIN_PUBLIC_TOO_MUCH: 'too-many-public',
  CHANNELS_ADMIN_LOCATED_TOO_MUCH: 'too-many-public',
  USER_CHANNELS_TOO_MUCH: 'too-many-public',
  USER_PRIVACY_RESTRICTED: 'privacy',
  FLOOD_WAIT: 'flood',
};

const asFailure = failureOf(CODES);
const nameOf = (error) => String(error?.errorMessage ?? error?.message ?? '');
// Only the error's name is read, never anything of the request: the
// password cannot reach an answer.
const failure = (error) => {
  const out = asFailure(error);
  const wait = /(?:PASSWORD|SESSION)_TOO_FRESH_(\d+)/.exec(nameOf(error));
  return wait ? { ...out, waitSeconds: Number(wait[1]) } : out;
};
const bad = () => ({ ok: false, error: 'bad-request', code: 'bad-request' });

const CHANNEL = /^-100\d{1,20}$/;
const CHAT = /^-\d{1,20}$/;
const USER = /^\d{1,20}$/;
export const PASSWORD_MAX = 256;

const createGigagroup =
  (env, userClient) =>
  async (body = {}) => {
    const chat = String(body.chat ?? '');
    if (!CHANNEL.test(chat) || body.confirm !== true) {
      return bad();
    }
    return connected(env, userClient, failure, async (c) => {
      await runIn(env, `gigagroup:${chat}`, () =>
        env.connection.withPeer(c.client, chat, (peer) =>
          c.client.invoke(
            new c.Api.channels.ConvertToGigagroup({ channel: peer })
          )
        )
      );
      return { ok: true };
    });
  };

// The user as an InputUser, from what GramJS knows, else by id alone.
const inputUserOf = async (c, user) => {
  const known = await inputPeerOf(c, user);
  return new c.Api.InputUser({
    userId: known.userId ?? c.helpers.returnBigInt(user),
    accessHash: known.accessHash ?? c.helpers.returnBigInt(0),
  });
};

// One try: fresh SRP data, the check made by the package's helper.
const tryTransfer = async (env, c, srp, { chat, user, password }) => {
  const pwd = await c.client.invoke(new c.Api.account.GetPassword());
  if (!pwd.hasPassword) {
    return { ok: false, error: 'PASSWORD_MISSING', code: 'password-missing' };
  }
  const check = await srp.computeCheck(pwd, password);
  const target = await inputUserOf(c, user);
  await runIn(env, `transfer:${chat}`, () =>
    env.connection.withPeer(c.client, chat, (peer) =>
      c.client.invoke(
        new c.Api.messages.EditChatCreator({
          peer,
          userId: target,
          password: check,
        })
      )
    )
  );
  return { ok: true };
};

const createTransfer =
  (env, userClient) =>
  async (body = {}) => {
    const chat = String(body.chat ?? '');
    const { password } = body;
    if (
      !CHAT.test(chat) ||
      !USER.test(String(body.user ?? '')) ||
      typeof password !== 'string' ||
      password === '' ||
      password.length > PASSWORD_MAX
    ) {
      return bad();
    }
    return connected(env, userClient, failure, async (c) => {
      const { password: srp } = await env.importer();
      // Repeated once when Telegram says its SRP data went stale.
      for (let attempt = 0; ; attempt += 1) {
        try {
          return await tryTransfer(env, c, srp, {
            chat,
            user: String(body.user),
            password,
          });
        } catch (error) {
          if (attempt === 0 && failure(error).code === 'srp-invalid') {
            continue;
          }
          return failure(error);
        }
      }
    });
  };

export const createOwnership = (env, context) => ({
  convertToGigagroup: createGigagroup(env, context.userClient),
  transferOwnership: createTransfer(env, context.userClient),
});
