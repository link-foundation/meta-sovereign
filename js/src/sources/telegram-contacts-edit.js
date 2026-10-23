/**
 * Close friends and adding a contact by phone number, as Telegram
 * Desktop has them (R-Y169; learned, never copied):
 * - `closeFriends()` — the user's contacts with who is a close friend now
 *   (contacts.getContacts, User.close_friend) →
 *   `{ ok, contacts: [{ id, name, username, closeFriend }] }`;
 * - `closeFriendsSet({ ids })` — the list saved as it is
 *   (contacts.editCloseFriends); an empty list clears it;
 * - `contactImport({ phone, firstName, lastName })` — one contact added
 *   by number (contacts.importContacts with an InputPhoneContact) →
 *   `{ ok, found: false }` when the number is not on Telegram, else
 *   `{ ok, found: true, contact: { id, name, username }, chat }`.
 * Telegram's errors become codes the page shows as text.
 */

import { connected, failureOf, runIn } from './telegram-stickers.js';
import { randomIdOf } from './telegram-send.js';

const CODES = {
  CONTACT_NAME_EMPTY: 'name-empty',
  PHONE_NUMBER_INVALID: 'phone-invalid',
  CONTACTS_TOO_MUCH: 'too-many',
  FLOOD_WAIT: 'flood',
  USER_ID_INVALID: 'bad-request',
};
const failure = failureOf(CODES);
const bad = (code) => ({ ok: false, error: code, code });

export const PHONE = /^\+\d{5,20}$/;
export const USER_ID = /^\d{1,20}$/;
export const MAX_NAME = 64;
export const MAX_IDS = 1000;

const textOf = (value) => String(value?.value ?? value);
const nameOf = (user) =>
  [user.firstName, user.lastName].filter(Boolean).join(' ') ||
  user.username ||
  textOf(user.id);

/** The user ids to save: distinct digit strings, up to 1000; else null. */
export const idsOf = (ids) => {
  if (!Array.isArray(ids) || ids.length > MAX_IDS) {
    return null;
  }
  const list = ids.map(String);
  return list.every((id) => USER_ID.test(id)) ? [...new Set(list)] : null;
};

/** A contact to add as Telegram takes it, or the code that refuses it. */
export const contactOf = (body = {}) => {
  const phone = String(body.phone ?? '').replace(/[\s()-]/g, '');
  const firstName = String(body.firstName ?? '').trim();
  const lastName = String(body.lastName ?? '').trim();
  if (!PHONE.test(phone)) {
    return bad('phone-invalid');
  }
  if (firstName === '') {
    return bad('name-empty');
  }
  if (
    Array.from(firstName).length > MAX_NAME ||
    Array.from(lastName).length > MAX_NAME
  ) {
    return bad('name-too-long');
  }
  return { ok: true, phone, firstName, lastName };
};

const listed = (user) => ({
  id: textOf(user.id),
  name: nameOf(user),
  username: user.username ?? null,
});

const createCloseFriends = (env, userClient) => async () =>
  connected(env, userClient, failure, async (c) => {
    const answer = await runIn(env, 'contacts:close-friends', () =>
      c.client.invoke(new c.Api.contacts.GetContacts({ hash: c.zero }))
    );
    const users = (answer?.users ?? []).filter(
      (u) => u && !u.self && !u.bot && !u.deleted
    );
    return {
      ok: true,
      contacts: users
        .map((u) => ({ ...listed(u), closeFriend: Boolean(u.closeFriend) }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  });

const createCloseFriendsSet =
  (env, userClient) =>
  async (body = {}) => {
    const ids = idsOf(body.ids);
    if (!ids) {
      return bad('bad-request');
    }
    return connected(env, userClient, failure, async (c) => {
      await runIn(env, 'contacts:close-friends-set', () =>
        c.client.invoke(
          new c.Api.contacts.EditCloseFriends({
            id: ids.map((id) => c.helpers.returnBigInt(id)),
          })
        )
      );
      return { ok: true, count: ids.length };
    });
  };

const createImport =
  (env, userClient) =>
  async (body = {}) => {
    const asked = contactOf(body);
    if (!asked.ok) {
      return asked;
    }
    return connected(env, userClient, failure, async (c) => {
      const answer = await runIn(env, 'contacts:import', () =>
        c.client.invoke(
          new c.Api.contacts.ImportContacts({
            contacts: [
              new c.Api.InputPhoneContact({
                clientId: randomIdOf(undefined, 0, c.helpers),
                phone: asked.phone,
                firstName: asked.firstName,
                lastName: asked.lastName,
              }),
            ],
          })
        )
      );
      const wanted = textOf(answer?.imported?.[0]?.userId ?? '');
      const user = (answer?.users ?? []).find((u) => textOf(u.id) === wanted);
      if (!wanted || !user) {
        return { ok: true, found: false };
      }
      const contact = listed(user);
      await Promise.resolve(
        env.peers?.remember?.(contact.id, user, {
          isUser: true,
          name: contact.name,
        })
      ).catch(() => {});
      return { ok: true, found: true, contact, chat: contact.id };
    });
  };

export const createContactsEdit = (env, { userClient }) => ({
  closeFriends: createCloseFriends(env, userClient),
  closeFriendsSet: createCloseFriendsSet(env, userClient),
  contactImport: createImport(env, userClient),
});
