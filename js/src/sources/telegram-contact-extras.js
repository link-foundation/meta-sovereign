/**
 * What Telegram's official clients have on a contact besides the chat
 * (R-Y217; learned, never copied):
 * - `contactNote({ chat, note })` — a private note on a contact
 *   (contacts.updateContactNote; read back as `note` in the chat info);
 * - `contactToken()` — "Share my contact": a link and its expiry
 *   (contacts.exportContactToken) → `{ ok, url, expires }`;
 *   `contactTokenOpen({ token })` — opens such a link
 *   (contacts.importContactToken) → `{ ok, chat, name }`;
 * - `phoneResolve({ phone })` — t.me/+<digits> (contacts.resolvePhone) →
 *   `{ ok, found: false }` or `{ ok, found: true, chat, name }`;
 * - `contactPhoto({ chat, mode, token })` — a photo for a contact, `mode`
 *   `save` (only the user sees it), `suggest` (the contact is asked) or
 *   `reset` (the personal one removed): photos.uploadContactProfilePhoto
 *   with the page's upload;
 * - `birthdaySuggest({ chat, day, month, year? })` — users.suggestBirthday;
 * - `savedContacts()` — the count of imported contacts Telegram keeps
 *   (contacts.getSaved); `savedContactsReset()` — contacts.resetSaved;
 * - `blockFromReplies({ msgId, deleteMessage, deleteHistory, reportSpam })`
 *   — "Block user" on a message of the Replies chat
 *   (contacts.blockFromReplies).
 * Nothing is sent but on the user's explicit click. Telegram's errors
 * become codes the page shows as text.
 */

import { connected, failureOf, runIn } from './telegram-stickers.js';
import { writeFailureOf } from './telegram-write-outcome.js';
import { uploadedFile } from './telegram-chat-edit.js';
import { validBirthday } from './telegram-profile-extras.js';
import { inputUserOf } from './telegram-peer-actions.js';

const CODES = {
  USER_ID_INVALID: 'no-user',
  CONTACT_ID_INVALID: 'no-user',
  PEER_ID_INVALID: 'no-user',
  CONTACT_NOTE_INVALID: 'note-invalid',
  NOTE_TOO_LONG: 'note-invalid',
  TOKEN_INVALID: 'token-invalid',
  CONTACT_TOKEN_INVALID: 'token-invalid',
  TOKEN_EXPIRED: 'token-invalid',
  PHOTO_INVALID: 'photo-invalid',
  PHOTO_EXT_INVALID: 'photo-invalid',
  IMAGE_PROCESS_FAILED: 'photo-invalid',
  BIRTHDAY_INVALID: 'birthday-invalid',
  MSG_ID_INVALID: 'not-found',
  FLOOD_WAIT: 'flood',
};
const failure = failureOf(CODES);
const writeFailure = writeFailureOf(CODES);
const bad = (code) => ({ ok: false, error: code, code });

export const USER = /^\d{1,20}$/;
export const TOKEN = /^[A-Za-z0-9_-]{1,128}$/;
export const PHONE_DIGITS = /^\d{5,20}$/;
export const MODES = ['save', 'suggest', 'reset'];
export const NOTE_MAX = 128;
const MSG_MAX = 2_147_483_647;

const textOf = (value) => String(value?.value ?? value);
const nameOf = (user) =>
  [user.firstName, user.lastName].filter(Boolean).join(' ') ||
  user.username ||
  textOf(user.id);

/** The note Telegram keeps on a contact, from users.getFullUser, or {}. */
export const noteOf = (full) => {
  const note = String(full?.note?.text ?? '');
  return {
    ...(note === '' ? {} : { note }),
    ...(full?.personalPhoto ? { personalPhoto: true } : {}),
  };
};

/** Whether `msgId` can be a message id. */
export const validMsgId = (msgId) =>
  Number.isInteger(msgId) && msgId > 0 && msgId <= MSG_MAX;

// A person found: remembered in the peer store, with their chat id.
const found = async (env, user) => {
  const chat = textOf(user.id);
  const name = nameOf(user);
  await Promise.resolve(
    env.peers?.remember?.(chat, user, { isUser: true, name })
  ).catch(() => {});
  return { ok: true, found: true, chat, name };
};

// A person's InputUser through the queue.
const withUser = (env, c, chat, key, use) =>
  runIn(env, `${key}:${chat}`, () =>
    env.connection.withPeer(c.client, chat, async (peer) =>
      use(await inputUserOf(c, peer))
    )
  );

const notePage = (c, note) =>
  new c.Api.TextWithEntities({ text: note, entities: [] });

const setNote =
  (env, userClient) =>
  async (body = {}) => {
    const chat = String(body.chat ?? '');
    const note = typeof body.note === 'string' ? body.note.trim() : null;
    if (!USER.test(chat) || note === null || note.length > NOTE_MAX) {
      return bad('bad-request');
    }
    return connected(env, userClient, writeFailure, async (c) => {
      await withUser(env, c, chat, 'contact-note', (id) =>
        c.client.invoke(
          new c.Api.contacts.UpdateContactNote({ id, note: notePage(c, note) })
        )
      );
      return { ok: true, note };
    });
  };

const exportToken = (env, userClient) => async () =>
  connected(env, userClient, failure, async (c) => {
    const token = await runIn(env, 'contact-token', () =>
      c.client.invoke(new c.Api.contacts.ExportContactToken())
    );
    return { ok: true, url: String(token.url), expires: Number(token.expires) };
  });

const importToken =
  (env, userClient) =>
  async (body = {}) => {
    const token = String(body.token ?? '');
    if (!TOKEN.test(token)) {
      return bad('token-invalid');
    }
    return connected(env, userClient, failure, async (c) => {
      const user = await runIn(env, 'contact-token-open', () =>
        c.client.invoke(new c.Api.contacts.ImportContactToken({ token }))
      );
      return user?.id ? found(env, user) : bad('token-invalid');
    });
  };

// A number nobody has on Telegram is a plain "not found", not a failure.
const phoneFailure = (error) =>
  String(error?.errorMessage ?? error?.message ?? '').includes(
    'PHONE_NOT_OCCUPIED'
  )
    ? { ok: true, found: false }
    : failure(error);

const resolvePhone =
  (env, userClient) =>
  async (body = {}) => {
    const phone = String(body.phone ?? '').replace(/^\+/, '');
    if (!PHONE_DIGITS.test(phone)) {
      return bad('phone-invalid');
    }
    return connected(env, userClient, phoneFailure, async (c) => {
      const answer = await runIn(env, 'contact-phone', () =>
        c.client.invoke(new c.Api.contacts.ResolvePhone({ phone }))
      );
      const user = (answer?.users ?? []).find((u) => u?.id);
      return user ? found(env, user) : { ok: true, found: false };
    });
  };

const photoRequest = async (c, uploads, id, { mode, token }) => {
  if (mode === 'reset') {
    return new c.Api.photos.UploadContactProfilePhoto({
      userId: id,
      save: true,
    });
  }
  const file = await uploadedFile(c, uploads, token);
  return file
    ? new c.Api.photos.UploadContactProfilePhoto({
        userId: id,
        file,
        [mode === 'save' ? 'save' : 'suggest']: true,
      })
    : null;
};

const setPhoto =
  (env, { userClient, uploads }) =>
  async (body = {}) => {
    const chat = String(body.chat ?? '');
    const token = String(body.token ?? '');
    try {
      if (!USER.test(chat) || !MODES.includes(body.mode)) {
        return bad('bad-request');
      }
      return await connected(env, userClient, writeFailure, async (conn) => {
        // uploadedFile reads the importer from `c.env`.
        const c = { ...conn, env };
        const sent = await withUser(
          env,
          c,
          chat,
          'contact-photo',
          async (id) => {
            const request = await photoRequest(c, uploads, id, {
              mode: body.mode,
              token,
            });
            return request ? c.client.invoke(request) : null;
          }
        );
        return sent ? { ok: true, mode: body.mode } : bad('photo-invalid');
      });
    } finally {
      await uploads?.dropUpload?.(token);
    }
  };

const suggestBirthday =
  (env, userClient) =>
  async (body = {}) => {
    const chat = String(body.chat ?? '');
    const { day, month, year } = body;
    if (!USER.test(chat) || !validBirthday({ day, month, year })) {
      return bad('birthday-invalid');
    }
    return connected(env, userClient, writeFailure, async (c) => {
      await withUser(env, c, chat, 'contact-birthday', (id) =>
        c.client.invoke(
          new c.Api.users.SuggestBirthday({
            id,
            birthday: new c.Api.Birthday({
              day,
              month,
              ...(year === undefined ? {} : { year }),
            }),
          })
        )
      );
      return { ok: true };
    });
  };

const savedCount = (env, userClient) => async () =>
  connected(env, userClient, failure, async (c) => {
    const saved = await runIn(env, 'contacts:saved', () =>
      c.client.invoke(new c.Api.contacts.GetSaved())
    );
    return { ok: true, count: Array.isArray(saved) ? saved.length : 0 };
  });

const savedReset = (env, userClient) => async () =>
  connected(env, userClient, writeFailure, async (c) => {
    await runIn(env, 'contacts:saved-reset', () =>
      c.client.invoke(new c.Api.contacts.ResetSaved())
    );
    return { ok: true };
  });

const blockReplies =
  (env, userClient) =>
  async (body = {}) => {
    const flags = ['deleteMessage', 'deleteHistory', 'reportSpam'];
    if (
      !validMsgId(body.msgId) ||
      flags.some((k) => body[k] !== undefined && typeof body[k] !== 'boolean')
    ) {
      return bad('bad-request');
    }
    return connected(env, userClient, writeFailure, async (c) => {
      await runIn(env, 'block-from-replies', () =>
        c.client.invoke(
          new c.Api.contacts.BlockFromReplies({
            msgId: body.msgId,
            ...Object.fromEntries(
              flags.filter((k) => body[k]).map((k) => [k, true])
            ),
          })
        )
      );
      return { ok: true };
    });
  };

/** `context.uploads` has the page's uploads (`uploadOf`, `dropUpload`). */
export const createContactExtras = (env, context) => ({
  contactNote: setNote(env, context.userClient),
  contactToken: exportToken(env, context.userClient),
  contactTokenOpen: importToken(env, context.userClient),
  phoneResolve: resolvePhone(env, context.userClient),
  contactPhoto: setPhoto(env, context),
  birthdaySuggest: suggestBirthday(env, context.userClient),
  savedContacts: savedCount(env, context.userClient),
  savedContactsReset: savedReset(env, context.userClient),
  blockFromReplies: blockReplies(env, context.userClient),
});
