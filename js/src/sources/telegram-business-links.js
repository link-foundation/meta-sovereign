/**
 * Business chat links (R-Y180; learned from Telegram Desktop's Settings →
 * Telegram Business → Chat links, never copied): a link t.me/m/<slug> that
 * opens a chat with the user and puts a ready text in the box.
 *
 * - `businessLinks()` → `{ ok, links: [{ slug, link, message, title,
 *   views }] }` (account.getBusinessChatLinks);
 * - `businessLinkCreate({ message, title? })` → `{ ok, link }`
 *   (account.createBusinessChatLink), on Save only;
 * - `businessLinkEdit({ slug, message, title? })` → `{ ok, link }`
 *   (account.editBusinessChatLink);
 * - `businessLinkDelete({ slug })` (account.deleteBusinessChatLink);
 * - `businessLinkResolve({ slug })` → `{ ok, chat, name, text }` — whose
 *   link it is and the text for the box (account.resolveBusinessChatLink).
 *   Nothing is sent: the page only puts the text in the box.
 */

import { connected, failureOf } from './telegram-stickers.js';
import { ask, bad, text } from './telegram-business.js';

const CODES = {
  PREMIUM_ACCOUNT_REQUIRED: 'premium',
  CHATLINKS_TOO_MUCH: 'too-many-links',
  CHATLINK_SLUG_EMPTY: 'link-gone',
  CHATLINK_SLUG_EXPIRED: 'link-gone',
  CHATLINK_INVALID: 'link-gone',
  CHATLINK_EXPIRED: 'link-gone',
  MESSAGE_EMPTY: 'text-empty',
  MESSAGE_TOO_LONG: 'text-long',
  FLOOD_WAIT: 'flood',
};

const failure = failureOf(CODES);

export const SLUG = /^[A-Za-z0-9_-]{1,64}$/;
export const TEXT_MAX = 4096;
export const TITLE_MAX = 32;

const length = (value) => Array.from(text(value)).length;

/** A business chat link as the page reads it. */
export const linkOf = (link) => {
  const address = text(link?.link);
  return {
    slug: address.split('/').filter(Boolean).pop() ?? '',
    link: address,
    message: text(link?.message),
    title: text(link?.title),
    views: Number(link?.views) || 0,
  };
};

/** Whether a link's words are valid: some text, a short title. */
export const validLinkBody = (body = {}) =>
  typeof body.message === 'string' &&
  body.message.trim() !== '' &&
  length(body.message) <= TEXT_MAX &&
  (body.title === undefined ||
    (typeof body.title === 'string' && length(body.title) <= TITLE_MAX));

const inputOf = (c, body) =>
  new c.Api.InputBusinessChatLink({
    message: body.message,
    ...(body.title?.trim() ? { title: body.title.trim() } : {}),
  });

export const createBusinessLinks = (env, { userClient }) => {
  const businessLinks = async () =>
    connected(env, userClient, failure, async (c) => {
      const answer = await ask(
        env,
        c,
        'business:links',
        new c.Api.account.GetBusinessChatLinks()
      );
      return { ok: true, links: (answer?.links ?? []).map(linkOf) };
    });

  const businessLinkCreate = async (body = {}) =>
    !validLinkBody(body)
      ? bad('text-empty')
      : connected(env, userClient, failure, async (c) => {
          const link = await ask(
            env,
            c,
            'business:link-create',
            new c.Api.account.CreateBusinessChatLink({
              link: inputOf(c, body),
            })
          );
          return { ok: true, link: linkOf(link) };
        });

  const businessLinkEdit = async (body = {}) =>
    !validLinkBody(body) || !SLUG.test(text(body.slug))
      ? bad('text-empty')
      : connected(env, userClient, failure, async (c) => {
          const link = await ask(
            env,
            c,
            'business:link-edit',
            new c.Api.account.EditBusinessChatLink({
              slug: body.slug,
              link: inputOf(c, body),
            })
          );
          return { ok: true, link: linkOf(link) };
        });

  const businessLinkDelete = async (body = {}) =>
    !SLUG.test(text(body.slug))
      ? bad('link-gone')
      : connected(env, userClient, failure, async (c) => {
          await ask(
            env,
            c,
            'business:link-delete',
            new c.Api.account.DeleteBusinessChatLink({ slug: body.slug })
          );
          return { ok: true };
        });

  const businessLinkResolve = async (body = {}) =>
    !SLUG.test(text(body.slug))
      ? bad('link-gone')
      : connected(env, userClient, failure, async (c) => {
          const answer = await ask(
            env,
            c,
            'business:link-resolve',
            new c.Api.account.ResolveBusinessChatLink({ slug: body.slug })
          );
          const id = answer?.peer?.userId;
          if (id === undefined) {
            return bad('link-gone');
          }
          const user = (answer.users ?? []).find(
            (u) => String(u?.id) === String(id)
          );
          const name =
            [user?.firstName, user?.lastName].filter(Boolean).join(' ') ||
            user?.username ||
            null;
          return {
            ok: true,
            chat: String(id),
            name,
            text: text(answer.message),
          };
        });

  return {
    businessLinks,
    businessLinkCreate,
    businessLinkEdit,
    businessLinkDelete,
    businessLinkResolve,
  };
};
