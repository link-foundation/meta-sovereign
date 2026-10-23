/**
 * Channel direct messages and suggested posts, shaped for the page
 * (R-Y191; learned from Telegram Desktop and the official apps, never
 * copied). Pure helpers, no network:
 * - `monoforumInfo(entity, chats)` — what a channel's info carries about
 *   its linked monoforum (the chat where subscribers write to the admins);
 * - `priceOf(amount)` — a StarsAmount / StarsTonAmount as `{ currency,
 *   amount }`;
 * - `suggestedOf(post)` — a SuggestedPost as `{ status, price, at }`;
 * - `actionOf(action)` — the suggested-post service messages;
 * - `dmMessageOf(message, names)` — one message of a thread;
 * - `threadOf(dialog, byId, names)` — one subscriber's thread.
 */

const text = (value) =>
  value === null || value === undefined ? '' : String(value.value ?? value);

const iso = (date) =>
  Number(date) > 0 ? new Date(Number(date) * 1000).toISOString() : null;

const NANO = 1_000_000_000;

/** A price: Stars (with nanos) or TON (the amount in nanoTON). */
export const priceOf = (amount) => {
  if (!amount) {
    return null;
  }
  if (amount.className === 'StarsTonAmount') {
    return { currency: 'ton', amount: Number(amount.amount) / NANO };
  }
  const stars = Number(amount.amount) + (Number(amount.nanos) || 0) / NANO;
  return { currency: 'stars', amount: stars };
};

/** A suggested post: pending until it is accepted or rejected. */
export const suggestedOf = (post) => {
  if (!post || post.className !== 'SuggestedPost') {
    return null;
  }
  let status = 'pending';
  if (post.accepted) {
    status = 'accepted';
  } else if (post.rejected) {
    status = 'rejected';
  }
  return {
    status,
    price: priceOf(post.price),
    at: iso(post.scheduleDate),
  };
};

/** The suggested-post service messages, as fields the page words. */
export const actionOf = (action) => {
  switch (action?.className) {
    case 'MessageActionSuggestedPostApproval':
      return {
        type: 'approval',
        rejected: Boolean(action.rejected),
        balanceTooLow: Boolean(action.balanceTooLow),
        comment: action.rejectComment ? String(action.rejectComment) : null,
        price: priceOf(action.price),
        at: iso(action.scheduleDate),
      };
    case 'MessageActionSuggestedPostSuccess':
      return { type: 'success', price: priceOf(action.price) };
    case 'MessageActionSuggestedPostRefund':
      return { type: 'refund', payerInitiated: Boolean(action.payerInitiated) };
    case 'MessageActionPaidMessagesPrice':
      return {
        type: 'price',
        stars: Number(action.stars) || 0,
        allowed: Boolean(action.broadcastMessagesAllowed),
      };
    default:
      return null;
  }
};

/** A person's name for a row. */
export const nameOfUser = (user) =>
  [user?.firstName, user?.lastName].filter(Boolean).join(' ') ||
  user?.username ||
  (user?.id === undefined ? '' : text(user.id));

/** `Map(userId -> name)` of an answer's users. */
export const namesOf = (users = []) =>
  new Map(users.filter(Boolean).map((u) => [text(u.id), nameOfUser(u)]));

const senderOf = (message) =>
  text(message.fromId?.userId ?? message.fromId?.channelId ?? '');

/** One message of a thread, as the page shows it. */
export const dmMessageOf = (message, names = new Map()) => {
  const action = actionOf(message.action);
  const from = senderOf(message);
  return {
    id: Number(message.id),
    out: Boolean(message.out),
    from,
    name: names.get(from) ?? '',
    text: String(message.message ?? ''),
    at: iso(message.date),
    thread: message.savedPeerId ? text(message.savedPeerId.userId) : null,
    paid: Number(message.paidMessageStars) || 0,
    suggested: suggestedOf(message.suggestedPost),
    ...(action ? { service: action } : {}),
  };
};

/** One subscriber's thread of a monoforum, for the list. */
export const threadOf = (dialog, byId, names) => {
  if (dialog?.className !== 'MonoForumDialog') {
    return null;
  }
  const id = text(dialog.peer?.userId ?? dialog.peer?.channelId);
  if (!id) {
    return null;
  }
  const last = byId.get(Number(dialog.topMessage));
  const shaped = last ? dmMessageOf(last, names) : null;
  return {
    peer: id,
    name: names.get(id) || id,
    unread: Number(dialog.unreadCount) || 0,
    top: Number(dialog.topMessage) || 0,
    at: shaped?.at ?? null,
    last: shaped ? { id: shaped.id, text: shaped.text, out: shaped.out } : null,
    free: Boolean(dialog.nopaidMessagesException),
  };
};

/**
 * What a channel's info says about its monoforum, from the channel
 * entity and the chats of the same answer: `{ id, title, price, admin,
 * allowed }`, or null without one. `price` is Stars per message (0 for
 * none); `admin` is whether the user answers the subscribers (the
 * creator, or an admin allowed to manage direct messages).
 */
export const monoforumInfo = (entity = {}, chats = []) => {
  const linked = text(entity.linkedMonoforumId);
  if (!linked || linked === '0') {
    return null;
  }
  const mono = chats.find((c) => c && text(c.id) === linked) ?? {};
  return {
    id: `-100${linked}`,
    title: String(mono.title ?? entity.title ?? ''),
    price:
      Number(mono.sendPaidMessagesStars ?? entity.sendPaidMessagesStars) || 0,
    allowed: Boolean(entity.broadcastMessagesAllowed),
    admin: Boolean(entity.creator || entity.adminRights?.manageDirectMessages),
  };
};
