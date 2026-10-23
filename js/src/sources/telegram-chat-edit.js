/**
 * New groups and channels, and a chat's info edited, as Telegram Desktop
 * does (R-Y129; learned, never copied):
 * - `chatContacts()` — the user's contacts to pick members from
 *   (contacts.getContacts) → `{ ok, contacts: [{ id, name, username }] }`;
 * - `createGroup({ title, users })` — a basic group of those contacts
 *   (messages.createChat) → `{ ok, chat, title }`;
 * - `createChannel({ title, about })` — a broadcast channel
 *   (channels.createChannel) → `{ ok, chat, title }`;
 * - `editChatInfo({ chat, title?, about?, photo? })` — the title, the
 *   description, and the photo: an upload's `token` (the page's upload,
 *   sent as the chat's photo) or `'remove'` → `{ ok }`.
 * The new peer is remembered and Telegram's answer goes through the live
 * handler. Telegram's errors become codes the page shows as text.
 */

import { markedId } from './telegram-invite.js';
import { connect, runIn, connected } from './telegram-stickers.js';

export const MAX_TITLE = 128;
export const MAX_ABOUT = 255;
export const MAX_MEMBERS = 200;

const CODES = {
  CHAT_TITLE_EMPTY: 'title-empty',
  CHAT_ABOUT_TOO_LONG: 'about-too-long',
  CHAT_ADMIN_REQUIRED: 'not-admin',
  USERS_TOO_FEW: 'users-too-few',
  USERS_TOO_MUCH: 'users-too-much',
  CHANNELS_TOO_MUCH: 'too-many-chats',
  CHANNELS_ADMIN_PUBLIC_TOO_MUCH: 'too-many-chats',
  USER_RESTRICTED: 'restricted',
  USER_PRIVACY_RESTRICTED: 'privacy',
  PHOTO_INVALID: 'photo-invalid',
  PHOTO_EXT_INVALID: 'photo-invalid',
  IMAGE_PROCESS_FAILED: 'photo-invalid',
};

const failure = (error) => {
  const text = String(error?.errorMessage ?? error?.message ?? '');
  const [, code = 'failed'] =
    Object.entries(CODES).find(([name]) => text.includes(name)) ?? [];
  return { ok: false, error: code, code };
};

const bad = (code) => ({ ok: false, error: code, code });

const CHAT = /^-\d{1,20}$/;
const textOf = (value) => String(value?.value ?? value);
const nameOf = (user) =>
  [user.firstName, user.lastName].filter(Boolean).join(' ') ||
  user.username ||
  textOf(user.id);

// A title as Telegram takes it: trimmed, one to 128 characters.
const titleOf = (value) => Array.from(String(value ?? '').trim());

const chatOf = (answer) => (answer?.chats ?? []).find(Boolean) ?? null;

// The chat a creation made: remembered, and its address.
const created = async (env, answer, { title, isChannel }) => {
  const chat = chatOf(answer);
  if (!chat) {
    return bad('failed');
  }
  const id = markedId(chat);
  await Promise.resolve(
    env.peers?.remember?.(id, chat, { title, isGroup: !isChannel, isChannel })
  ).catch(() => {});
  return { ok: true, chat: id, title };
};

const createContacts = (env, userClient, known) => async () =>
  connected(env, userClient, failure, async (c) => {
    const answer = await runIn(env, 'contacts:list', () =>
      c.client.invoke(new c.Api.contacts.GetContacts({ hash: c.zero }))
    );
    const users = (answer?.users ?? []).filter(
      (u) => u && !u.self && !u.bot && !u.deleted
    );
    for (const user of users) {
      known.set(textOf(user.id), user);
    }
    return {
      ok: true,
      contacts: users
        .map((u) => ({
          id: textOf(u.id),
          name: nameOf(u),
          username: u.username ?? null,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  });

// What a group's creation is asked with, or the code that refuses it.
const groupRequest = (request) => {
  const title = titleOf(request.title);
  const ids = [...new Set((request.users ?? []).map(String))];
  if (title.length === 0 || title.length > MAX_TITLE) {
    return bad(title.length === 0 ? 'title-empty' : 'title-too-long');
  }
  if (ids.length === 0 || ids.length > MAX_MEMBERS) {
    return bad(ids.length === 0 ? 'users-too-few' : 'users-too-much');
  }
  return { ok: true, title: title.join(''), ids };
};

const createGroupMaker =
  (env, { userClient, apply }, known) =>
  async (request = {}) => {
    const asked = groupRequest(request);
    if (!asked.ok) {
      return asked;
    }
    return connected(env, userClient, failure, async (c) => {
      if (asked.ids.some((id) => !known.has(id))) {
        await createContacts(env, userClient, known)();
      }
      if (asked.ids.some((id) => !known.has(id))) {
        return bad('users-unknown');
      }
      const answer = await runIn(env, 'chat:create', () =>
        c.client.invoke(
          new c.Api.messages.CreateChat({
            title: asked.title,
            users: asked.ids.map(
              (id) =>
                new c.Api.InputUser({
                  userId: known.get(id).id,
                  accessHash: known.get(id).accessHash ?? c.zero,
                })
            ),
          })
        )
      );
      const updates = answer?.updates ?? answer;
      if (updates && typeof updates === 'object') {
        await apply(c.client, updates);
      }
      return await created(env, updates, {
        title: asked.title,
        isChannel: false,
      });
    });
  };

const createChannelMaker =
  (env, { userClient, apply }) =>
  async (request = {}) => {
    const title = titleOf(request.title);
    const about = String(request.about ?? '');
    if (title.length === 0 || title.length > MAX_TITLE) {
      return bad(title.length === 0 ? 'title-empty' : 'title-too-long');
    }
    if (Array.from(about).length > MAX_ABOUT) {
      return bad('about-too-long');
    }
    return connected(env, userClient, failure, async (c) => {
      const answer = await runIn(env, 'chat:create', () =>
        c.client.invoke(
          new c.Api.channels.CreateChannel({
            broadcast: true,
            title: title.join(''),
            about,
          })
        )
      );
      if (answer && typeof answer === 'object') {
        await apply(c.client, answer);
      }
      return await created(env, answer, {
        title: title.join(''),
        isChannel: true,
      });
    });
  };

// One step of an edit: Telegram saying nothing changed is no failure.
const step = async (use) => {
  try {
    return await use();
  } catch (error) {
    if (!String(error?.errorMessage ?? '').includes('CHAT_NOT_MODIFIED')) {
      throw error;
    }
    return null;
  }
};

// The photo to set: the page's upload sent to Telegram, or none.
const photoOf = async (c, uploads, wanted) => {
  if (wanted === 'remove') {
    return new c.Api.InputChatPhotoEmpty();
  }
  const entry = uploads?.uploadOf?.(wanted);
  if (!entry?.path) {
    return null;
  }
  const telegram = await c.env.importer();
  const CustomFile =
    telegram.client?.uploads?.CustomFile ?? telegram.CustomFile;
  const file = await c.client.uploadFile({
    file: new CustomFile(entry.name, entry.size, entry.path),
    workers: 1,
  });
  return new c.Api.InputChatUploadedPhoto({ file });
};

const editRequests = (c, { chat, peer, title, about, photo }) => {
  const channel = chat.startsWith('-100');
  const chatId = c.helpers.returnBigInt(chat.slice(1));
  const requests = [];
  if (title !== undefined) {
    requests.push(
      channel
        ? new c.Api.channels.EditTitle({ channel: peer, title })
        : new c.Api.messages.EditChatTitle({ chatId, title })
    );
  }
  if (about !== undefined) {
    requests.push(new c.Api.messages.EditChatAbout({ peer, about }));
  }
  if (photo) {
    requests.push(
      channel
        ? new c.Api.channels.EditPhoto({ channel: peer, photo })
        : new c.Api.messages.EditChatPhoto({ chatId, photo })
    );
  }
  return requests;
};

// The edit asked for, or the code that refuses it.
const editRequest = (request) => {
  const chat = String(request.chat ?? '');
  const title =
    request.title === undefined ? undefined : titleOf(request.title);
  const about = request.about === undefined ? undefined : String(request.about);
  if (!CHAT.test(chat)) {
    return bad('failed');
  }
  if (title && (title.length === 0 || title.length > MAX_TITLE)) {
    return bad(title.length === 0 ? 'title-empty' : 'title-too-long');
  }
  if (about !== undefined && Array.from(about).length > MAX_ABOUT) {
    return bad('about-too-long');
  }
  return {
    ok: true,
    chat,
    title: title?.join(''),
    about,
    wanted: request.photo === undefined ? null : String(request.photo),
  };
};

const createEditor =
  (env, { userClient, apply, uploads }) =>
  async (request = {}) => {
    const asked = editRequest(request);
    if (!asked.ok) {
      return asked;
    }
    const { chat, wanted } = asked;
    const c = await connect(env, userClient);
    if (!c) {
      return { ok: false, supported: false };
    }
    try {
      return await runIn(env, `chat:edit:${chat}`, () =>
        env.connection.withPeer(c.client, chat, async (peer) => {
          const photo = wanted
            ? await photoOf({ ...c, env }, uploads, wanted)
            : null;
          if (wanted && !photo) {
            return bad('photo-invalid');
          }
          for (const next of editRequests(c, { ...asked, peer, photo })) {
            const answer = await step(() => c.client.invoke(next));
            if (answer && typeof answer === 'object') {
              await apply(c.client, answer);
            }
          }
          return { ok: true };
        })
      );
    } catch (error) {
      return failure(error);
    } finally {
      if (wanted && wanted !== 'remove') {
        await uploads?.dropUpload?.(wanted);
      }
    }
  };

/** `uploads` has the page's uploads (`uploadOf`, `dropUpload`). */
export const createChatEdit = (env, context) => {
  const known = new Map();
  return {
    chatContacts: createContacts(env, context.userClient, known),
    createGroup: createGroupMaker(env, context, known),
    createChannel: createChannelMaker(env, context),
    editChatInfo: createEditor(env, context),
  };
};
