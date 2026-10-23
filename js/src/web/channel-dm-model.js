// Channel direct messages and suggested posts, the page's pure parts
// (R-Y191; learned from Telegram's apps, never copied): when the info
// column offers the chat, what a card says, the questions asked before a
// decision, and the bodies sent. No network, no clock of its own.

import { starsText } from './stars-model.js';

/** Whether a channel's info offers its direct messages. */
export const hasDirectMessages = (chat, info, api) =>
  chat?.source === 'telegram' &&
  String(chat.chat).startsWith('-100') &&
  Boolean(info?.monoforum?.id) &&
  typeof api?.telegramChannelDmHistory === 'function';

/** A price as words: "50 ⭐" or "1.5 TON"; "" for none. */
export const priceText = (price) => {
  if (!price || !(Number(price.amount) > 0)) {
    return '';
  }
  return price.currency === 'ton'
    ? `${starsText(price.amount)} TON`
    : `${starsText(price.amount)} ⭐`;
};

/** The note by the composer: what one message costs, or null. */
export const perMessageNote = (t, stars) =>
  Number(stars) > 0 ? t('chat.dm.perMessage', { count: Number(stars) }) : null;

/** A suggested post's card: its status, price and date, or null. */
export const cardOf = (message) => {
  const post = message?.suggested;
  return post
    ? {
        status: ['accepted', 'rejected'].includes(post.status)
          ? post.status
          : 'pending',
        price: post.price ?? null,
        at: post.at ?? null,
      }
    : null;
};

/** Whether Approve and Decline show: an admin, a pending post, not ours. */
export const canDecide = (message, admin) =>
  Boolean(admin) &&
  cardOf(message)?.status === 'pending' &&
  !message.out &&
  !message.service;

/** The question before accepting: "Approve this post for 50 ⭐?" */
export const approveQuestion = (t, message) => {
  const price = priceText(message?.suggested?.price);
  return price
    ? t('chat.dm.approveAsk', { price })
    : t('chat.dm.approveAskFree');
};

const approvalText = (t, service, when) => {
  if (service.balanceTooLow) {
    return t('chat.dm.svc.balance');
  }
  if (service.rejected) {
    return service.comment
      ? t('chat.dm.svc.rejectedWhy', { comment: service.comment })
      : t('chat.dm.svc.rejected');
  }
  return service.at
    ? t('chat.dm.svc.approvedAt', { date: when(service.at) })
    : t('chat.dm.svc.approved');
};

/**
 * A service message as words; null for any other. `when` words a date
 * (the page's date formatter).
 */
export const serviceText = (t, service, when = (at) => String(at)) => {
  switch (service?.type) {
    case 'approval':
      return approvalText(t, service, when);
    case 'success':
      return t('chat.dm.svc.success', { price: priceText(service.price) });
    case 'refund':
      return service.payerInitiated
        ? t('chat.dm.svc.refundPayer')
        : t('chat.dm.svc.refund');
    case 'price':
      return service.stars > 0
        ? t('chat.dm.svc.price', { count: service.stars })
        : t('chat.dm.svc.priceFree');
    default:
      return null;
  }
};

/**
 * The seconds of a date typed in a datetime-local box, or null for none
 * or one that is not in the future of `now` (ms).
 */
export const scheduleOf = (typed, now) => {
  const at = Date.parse(String(typed ?? ''));
  return Number.isFinite(at) && at > now ? Math.floor(at / 1000) : null;
};

/**
 * The body of "Suggest a post", or null while it is not ready: text, a
 * price in whole Stars (0 or more), a date typed or none, and the price a
 * message costs (`stars`).
 */
export const suggestBody = ({ chat, text, price, date, stars }, now) => {
  const cost = Number(price);
  const body = String(text ?? '').trim();
  const typed = String(date ?? '').trim();
  const at = scheduleOf(typed, now);
  if (!body || !Number.isInteger(cost) || cost < 0 || (typed && !at)) {
    return null;
  }
  return {
    chat,
    text: body,
    suggestedPost: { stars: cost, ...(at ? { scheduleDate: at } : {}) },
    ...(Number(stars) > 0 ? { stars: Number(stars) } : {}),
  };
};

/** The body of a plain message through the account's route, or null. */
export const replyBody = ({ chat, peer, text, stars }) => {
  const body = String(text ?? '').trim();
  return body
    ? {
        chat,
        text: body,
        ...(peer ? { peer } : {}),
        ...(Number(stars) > 0 ? { stars: Number(stars) } : {}),
      }
    : null;
};

/** The decision's body: approving keeps the post's own date. */
export const decideBody = ({ chat, message, approve, comment }) => ({
  chat,
  id: message.id,
  approve,
  ...(approve && message.suggested?.at
    ? { scheduleDate: Math.floor(Date.parse(message.suggested.at) / 1000) }
    : {}),
  ...(!approve && String(comment ?? '').trim()
    ? { comment: String(comment).trim() }
    : {}),
});

/** The word for a failure code, from `chat.dm.err.<code>`. */
export const errorText = (t, code) => {
  const key = `chat.dm.err.${code}`;
  const text = t(key);
  return text === key ? t('chat.dm.err.failed') : text;
};
