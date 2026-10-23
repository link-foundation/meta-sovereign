/**
 * Telegram Stars, as Telegram Desktop shows them (R-Y176; learned, never
 * copied). Buying Stars is not here: they are bought in the official apps.
 * - `starsStatus()` — payments.getStarsStatus for the user's own peer →
 *   `{ ok, balance }`;
 * - `starsHistory({ filter?, offset? })` — payments.getStarsTransactions
 *   (`filter` all, in or out; a page of 30) → `{ ok, balance,
 *   transactions: [{ id, amount (signed), date, title, description, kind,
 *   source: { kind, name }, refund, pending, failed }], next }`;
 * - `starGifts({ chat, offset? })` — payments.getSavedStarGifts of a person
 *   (a page of 24) → `{ ok, count, mine, gifts: [{ msgId, savedId, from,
 *   fromName, anonymous, date, stars, title, text, hidden, sticker }], next
 *   }`; each `sticker` is the sticker panel's item (the sticker renderer
 *   draws it by id, see telegram-stickers.js);
 * - `starGiftSave({ chat, msgId, unsave })` — payments.saveStarGift: shows
 *   a gift on the profile or hides it (a WRITE, on a click only);
 * - `paidReaction({ chat, id, count })` — messages.sendPaidReaction with a
 *   random id (a WRITE, on the dialog's Send only), 1..PAID_REACTION_MAX;
 * - `paidMediaUnlock({ chat, id, stars })` — payments.getPaymentForm with
 *   InputInvoiceMessage, then payments.sendStarsForm with that form id, only
 *   when the form's price is the `stars` the page showed (a WRITE, on the
 *   confirmation only); the message is read again after.
 * Telegram's errors become codes the page shows as text.
 */

import { connected, failureOf, panelItem, runIn } from './telegram-stickers.js';
import { randomIdOf } from './telegram-send.js';

export const HISTORY_PAGE = 30;
export const GIFTS_PAGE = 24;
// Telegram's default limit of one paid reaction (its appConfig may differ).
export const PAID_REACTION_MAX = 2500;

const CODES = {
  BALANCE_TOO_LOW: 'balance',
  STARS_BALANCE_TOO_LOW: 'balance',
  PAYMENT_FAILED: 'balance',
  MESSAGE_ID_INVALID: 'no-message',
  PEER_ID_INVALID: 'no-chat',
  CHANNEL_INVALID: 'no-chat',
  CHANNEL_PRIVATE: 'no-chat',
  REACTION_INVALID: 'not-allowed',
  PAID_REACTION_NOT_ALLOWED: 'not-allowed',
  INVOICE_INVALID: 'no-invoice',
  FORM_ID_EXPIRED: 'expired',
  SAVED_ID_EMPTY: 'no-gift',
  STARGIFT_NOT_FOUND: 'no-gift',
  FLOOD_WAIT: 'flood',
};
const failure = failureOf(CODES);
const BAD = { ok: false, error: 'bad request', code: 'failed' };
const CHAT = /^-?\d{1,20}$/;
const USER = /^\d{1,20}$/;
const text = (value) => String(value?.value ?? value ?? '');
const whole = (n) => Number(n ?? 0) || 0;
const FILTERS = { all: {}, in: { inbound: true }, out: { outbound: true } };

/** A StarsAmount as a number of Stars (nanos are billionths). */
export const amountOf = (amount) =>
  Number(amount?.amount ?? 0) + whole(amount?.nanos) / 1e9;

const nameOf = (entity) =>
  entity?.title ||
  [entity?.firstName, entity?.lastName].filter(Boolean).join(' ') ||
  (entity?.username ? `@${entity.username}` : '');

const entitiesOf = (answer) =>
  new Map(
    [...(answer?.users ?? []), ...(answer?.chats ?? [])].map((e) => [
      text(e.id),
      e,
    ])
  );

const peerEntity = (peer, entities) =>
  entities.get(text(peer?.userId ?? peer?.channelId ?? peer?.chatId));

const KINDS = {
  StarsTransactionPeerFragment: 'fragment',
  StarsTransactionPeerAppStore: 'appstore',
  StarsTransactionPeerPlayMarket: 'playmarket',
  StarsTransactionPeerPremiumBot: 'premiumbot',
  StarsTransactionPeerAds: 'ads',
  StarsTransactionPeerAPI: 'api',
};

/** Where a transaction came from: `{ kind, name }`. */
export const sourceOf = (peer, entities) => {
  if (peer?.className === 'StarsTransactionPeer') {
    return {
      kind: 'peer',
      name: nameOf(peerEntity(peer.peer, entities)),
    };
  }
  return { kind: KINDS[peer?.className] ?? 'unknown', name: '' };
};

// What a transaction is for, as the row's label.
const purposeOf = (t) => {
  if (t.gift || t.stargift) {
    return 'gift';
  }
  if (t.reaction) {
    return 'reaction';
  }
  if ((t.extendedMedia ?? []).length > 0) {
    return 'media';
  }
  return t.subscriptionPeriod ? 'subscription' : '';
};

/** Telegram's transactions as the page's rows. */
export const transactionsOf = (answer) => {
  const entities = entitiesOf(answer);
  return (answer?.history ?? []).map((t) => ({
    id: String(t.id ?? ''),
    amount: amountOf(t.amount),
    date: whole(t.date),
    title: String(t.title ?? ''),
    description: String(t.description ?? ''),
    kind: purposeOf(t),
    source: sourceOf(t.peer, entities),
    refund: Boolean(t.refund),
    pending: Boolean(t.pending),
    failed: Boolean(t.failed),
  }));
};

// A gift's sticker document: a regular gift's, or a unique one's model.
const stickerDoc = (gift) =>
  gift?.sticker ??
  (gift?.attributes ?? []).find(
    (a) => a?.className === 'StarGiftAttributeModel'
  )?.document;

const giftOf = (saved, entities, remember) => {
  const doc = stickerDoc(saved.gift);
  const anonymous = Boolean(saved.nameHidden) || !saved.fromId;
  return {
    msgId: whole(saved.msgId),
    savedId: text(saved.savedId),
    from: anonymous ? null : text(saved.fromId.userId),
    fromName: anonymous ? '' : nameOf(peerEntity(saved.fromId, entities)),
    anonymous,
    date: whole(saved.date),
    stars: whole(saved.gift?.stars ?? saved.gift?.valueAmount),
    title: String(saved.gift?.title ?? ''),
    text: String(saved.message?.text ?? ''),
    hidden: Boolean(saved.unsaved),
    sticker: doc?.className === 'Document' ? remember(doc) : null,
  };
};

/** Telegram's saved gifts as the page's. */
export const giftsOf = (answer, remember = (doc) => panelItem(doc)) => {
  const entities = entitiesOf(answer);
  return (answer?.gifts ?? []).map((g) => giftOf(g, entities, remember));
};

/** The price of a payment form in Stars: the sum of the invoice's prices. */
export const formPrice = (form) =>
  (form?.invoice?.prices ?? []).reduce((sum, p) => sum + whole(p.amount), 0);

export const createStars = (env, { userClient, stickers }) => {
  // The messages read again once the account's actions exist.
  const refreshMessages = (request) => env.actions?.refreshMessages?.(request);
  const doing = (key, use) =>
    connected(env, userClient, failure, (c) => runIn(env, key, () => use(c)));
  const withChat = (c, chat, use) =>
    env.connection.withPeer(c.client, chat, use);
  const statusOf = (c) =>
    c.client.invoke(
      new c.Api.payments.GetStarsStatus({ peer: new c.Api.InputPeerSelf() })
    );

  const starsStatus = async () =>
    doing('stars:status', async (c) => ({
      ok: true,
      balance: amountOf((await statusOf(c))?.balance),
    }));

  const starsHistory = async ({ filter = 'all', offset = '' } = {}) =>
    !Object.hasOwn(FILTERS, filter) ||
    typeof offset !== 'string' ||
    offset.length > 200
      ? BAD
      : doing(`stars:history:${filter}`, async (c) => {
          const answer = await c.client.invoke(
            new c.Api.payments.GetStarsTransactions({
              ...FILTERS[filter],
              peer: new c.Api.InputPeerSelf(),
              offset,
              limit: HISTORY_PAGE,
            })
          );
          return {
            ok: true,
            balance: amountOf(answer?.balance),
            transactions: transactionsOf(answer),
            next: answer?.nextOffset ? String(answer.nextOffset) : null,
          };
        });

  // A gift's sticker is kept by the sticker lists, so the page's sticker
  // renderer can ask for its picture by id.
  const remember = (chat) => (doc) =>
    stickers?.remember
      ? stickers.remember([doc], `gift:${chat}`, 'sticker')[0]
      : panelItem(doc);

  const starGifts = async ({ chat, offset = '' } = {}) =>
    !USER.test(String(chat ?? '')) ||
    typeof offset !== 'string' ||
    offset.length > 200
      ? BAD
      : doing(`stars:gifts:${chat}`, (c) =>
          withChat(c, String(chat), async (peer) => {
            const answer = await c.client.invoke(
              new c.Api.payments.GetSavedStarGifts({
                peer,
                offset,
                limit: GIFTS_PAGE,
              })
            );
            const me = await c.client.getMe?.().catch(() => null);
            return {
              ok: true,
              count: whole(answer?.count),
              mine: Boolean(me) && text(me.id) === String(chat),
              gifts: giftsOf(answer, remember(String(chat))),
              next: answer?.nextOffset ? String(answer.nextOffset) : null,
            };
          })
        );

  const starGiftSave = async ({ chat, msgId, unsave } = {}) =>
    !USER.test(String(chat ?? '')) ||
    !Number.isInteger(msgId) ||
    msgId < 1 ||
    typeof unsave !== 'boolean'
      ? BAD
      : doing(`stars:gift-save:${chat}`, async (c) => {
          await c.client.invoke(
            new c.Api.payments.SaveStarGift({
              unsave,
              stargift: new c.Api.InputSavedStarGiftUser({ msgId }),
            })
          );
          return { ok: true, hidden: unsave };
        });

  const paidReaction = async ({ chat, id, count } = {}) =>
    !CHAT.test(String(chat ?? '')) ||
    !Number.isInteger(id) ||
    id < 1 ||
    !Number.isInteger(count) ||
    count < 1 ||
    count > PAID_REACTION_MAX
      ? BAD
      : doing(`stars:react:${chat}:${id}`, (c) =>
          withChat(c, String(chat), async (peer) => {
            await c.client.invoke(
              new c.Api.messages.SendPaidReaction({
                peer,
                msgId: id,
                count,
                randomId: randomIdOf(null, 0, c.helpers),
              })
            );
            await refreshMessages?.({ chat: String(chat), ids: [id] });
            return { ok: true, sent: count };
          })
        );

  const paidMediaUnlock = async ({ chat, id, stars } = {}) =>
    !CHAT.test(String(chat ?? '')) ||
    !Number.isInteger(id) ||
    id < 1 ||
    !Number.isInteger(stars) ||
    stars < 1
      ? BAD
      : doing(`stars:unlock:${chat}:${id}`, (c) =>
          withChat(c, String(chat), async (peer) => {
            const invoice = new c.Api.InputInvoiceMessage({ peer, msgId: id });
            const form = await c.client.invoke(
              new c.Api.payments.GetPaymentForm({ invoice })
            );
            if (formPrice(form) !== stars) {
              return { ok: false, error: 'price changed', code: 'price' };
            }
            await c.client.invoke(
              new c.Api.payments.SendStarsForm({ formId: form.formId, invoice })
            );
            await refreshMessages?.({ chat: String(chat), ids: [id] });
            return { ok: true, paid: stars };
          })
        );

  // A gift sticker's file reference expired: its person's gifts, again.
  stickers?.onAgain?.('gift:', (chat) => starGifts({ chat }));

  return {
    starsStatus,
    starsHistory,
    starGifts,
    starGiftSave,
    paidReaction,
    paidMediaUnlock,
  };
};
