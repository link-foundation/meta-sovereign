// The words of a chat's service messages (R-Y221; learned from how Telegram
// Desktop phrases them, never copied): "Ann added Bob", "You changed the
// group photo", "Ann invited you to the group call" — for every action of
// the Telegram layer, with the actor and the people named by their names
// and "You" where the actor is the user. Pure: no React and no DOM, so the
// message parser and tests share it.
//
// `serviceTextInfo(link, replied)` gives `{ key, params, … }` or null (an
// action the older code words); the page turns `params` into text with
// `fillParams(t, params, locale)`. A param is a string, a number, null
// (someone unnamed), a list, or one of `{ tkey, vars }` (a locale phrase),
// `{ at }` (a date in seconds), `{ money }` and `{ birthday }`.

import { dateText } from './giveaway-model.js';
import { formatCallDuration } from './call-model.js';

const NS = 'chat.service.';
const TK = (tkey, vars) => ({ tkey: `${NS}${tkey}`, vars });
const YOU = TK('you');
const num = (value) => Number(value) || 0;
const idKey = (peer) => {
  if (peer?.userId !== undefined) {
    return String(peer.userId);
  }
  if (peer?.chatId !== undefined) {
    return `-${peer.chatId}`;
  }
  return peer?.channelId === undefined ? '' : `-100${peer.channelId}`;
};

// A period of seconds as the largest whole unit: 604800 -> 1 week.
const UNITS = [
  ['year', 31536000],
  ['month', 2592000],
  ['week', 604800],
  ['day', 86400],
  ['hour', 3600],
  ['minute', 60],
];

/** `{ unit, count }` of a period in seconds. */
export const periodOf = (seconds) => {
  const total = Math.max(0, Math.floor(num(seconds)));
  // A month in Telegram's timers is 31 days.
  if (total === 2678400) {
    return { unit: 'month', count: 1 };
  }
  const found = UNITS.find(([, size]) => total >= size && total % size === 0);
  return found
    ? { unit: found[0], count: total / found[1] }
    : { unit: 'second', count: total };
};

const periodParam = (seconds) => {
  const { unit, count } = periodOf(seconds);
  return TK(`unit.${unit}`, { count });
};

/** An amount in a currency's smallest units, as the locale writes it. */
export const moneyText = (currency, amount, locale) => {
  const code = String(currency ?? '');
  if (code === 'XTR') {
    return `${num(amount)} ⭐`;
  }
  try {
    const format = new Intl.NumberFormat(locale || undefined, {
      style: 'currency',
      currency: code,
    });
    const digits = format.resolvedOptions().maximumFractionDigits;
    return format.format(num(amount) / 10 ** digits);
  } catch {
    return `${num(amount) / 100} ${code}`;
  }
};

const birthdayText = ({ day, month, year }, locale) => {
  try {
    return new Intl.DateTimeFormat(locale || undefined, {
      day: 'numeric',
      month: 'long',
      ...(year ? { year: 'numeric' } : {}),
      timeZone: 'UTC',
    }).format(new Date(Date.UTC(year || 2000, num(month) - 1, num(day))));
  } catch {
    return `${day}.${month}${year ? `.${year}` : ''}`;
  }
};

/** The values of `params` as text; `t(key, vars)` words the phrases. */
export const fillParams = (t, params = {}, locale = undefined) => {
  const one = (value) => {
    if (value === null || value === undefined) {
      return t(`${NS}someone`);
    }
    if (Array.isArray(value)) {
      return value.map(one).join(', ');
    }
    if (typeof value !== 'object') {
      return value;
    }
    if (value.tkey) {
      return t(value.tkey, fillParams(t, value.vars ?? {}, locale));
    }
    if ('at' in value) {
      return dateText(value.at, locale);
    }
    if (value.money) {
      return moneyText(value.money.currency, value.money.amount, locale);
    }
    return birthdayText(value.birthday, locale);
  };
  return Object.fromEntries(
    Object.entries(params).map(([k, v]) => [k, one(v)])
  );
};

// ---- who and what an action names -----------------------------------------

const contextOf = (link, replied) => {
  const raw = link.raw ?? {};
  const names = raw.actionNames ?? {};
  const who = (key) => {
    const entry = names[String(key)];
    if (!entry) {
      return null;
    }
    return entry.self ? YOU : entry.name || null;
  };
  const mine = link.sender === 'me';
  return {
    link,
    action: raw.action ?? {},
    mine,
    channel: link.chatType === 'channel',
    // The one who did it; null (someone) when not named. The user is "You".
    actor: mine ? null : link.senderName || null,
    chatName: link.chatName || null,
    who,
    peer: (peer) => who(idKey(peer)),
    users: (ids) => (ids ?? []).map(who),
    replied,
  };
};

// The line with the actor, in the form for who did it.
const act = (c, base, params = {}) => ({
  key: `${NS}${base}${c.mine ? 'Me' : ''}`,
  params: { actor: c.actor, ...params },
});
const plain = (base, params = {}) => ({ key: `${NS}${base}`, params });

// The other side of a private chat, for "to {peer}".
const chatPeer = (c) => c.chatName;
const quoted = (value) => (value ? `“${value}”` : null);
const textOf = (twe) => String(twe?.text ?? twe ?? '');

// ---- members and the chat --------------------------------------------------

const MEMBERS = {
  MessageActionChatAddUser: (c) => {
    const ids = (c.action.users ?? []).map(String);
    if (ids.length === 0) {
      return null;
    }
    const joined =
      ids.length === 1 &&
      (ids[0] === String(c.link.sender) || (c.mine && c.users(ids)[0] === YOU));
    return joined ? act(c, 'joined') : act(c, 'added', { users: c.users(ids) });
  },
  MessageActionChatDeleteUser: (c) => {
    const id = String(c.action.userId ?? '');
    const left = id === String(c.link.sender) || (c.mine && c.who(id) === YOU);
    return left ? act(c, 'left') : act(c, 'removed', { users: [c.who(id)] });
  },
  MessageActionChatJoinedByLink: (c) => act(c, 'joinedLink'),
  MessageActionChatJoinedByRequest: (c) => act(c, 'joinedRequest'),
  MessageActionContactSignUp: (c) => plain('signedUp', { actor: c.actor }),
  MessageActionHistoryClear: () => plain('historyClear'),
  MessageActionChatEditPhoto: (c) =>
    c.channel
      ? { ...plain('channelPhotoSet'), photo: true }
      : { ...act(c, 'photoSet'), photo: true },
  MessageActionChatDeletePhoto: (c) =>
    c.channel ? plain('channelPhotoDel') : act(c, 'photoDel'),
  MessageActionBoostApply: (c) =>
    act(c, 'boost', { count: num(c.action.boosts) }),
  MessageActionScreenshotTaken: (c) => act(c, 'screenshot'),
  MessageActionManagedBotCreated: (c) =>
    act(c, 'botCreated', { bot: c.who(c.action.botId) }),
  MessageActionChangeCreator: (c) =>
    act(c, 'ownerChanged', { users: [c.who(c.action.newCreatorId)] }),
  MessageActionNewCreatorPending: (c) =>
    plain('ownerPending', { users: [c.who(c.action.newCreatorId)] }),
};

// ---- calls ------------------------------------------------------------------

const callActions = {
  MessageActionGroupCall: (c) =>
    num(c.action.duration) > 0
      ? plain('groupCallEnded', {
          duration: formatCallDuration(c.action.duration),
        })
      : act(c, 'groupCallStarted'),
  MessageActionInviteToGroupCall: (c) =>
    act(c, 'groupCallInvite', { users: c.users(c.action.users) }),
  MessageActionGroupCallScheduled: (c) =>
    plain('groupCallScheduled', { date: { at: num(c.action.scheduleDate) } }),
  MessageActionConferenceCall: (c) => {
    if (c.action.missed) {
      return plain('confMissed');
    }
    if (c.action.active) {
      return plain('confActive');
    }
    return num(c.action.duration) > 0
      ? plain('confEnded', { duration: formatCallDuration(c.action.duration) })
      : plain('confStarted');
  },
};

// ---- settings of the chat -----------------------------------------------------

const themeOf = (theme) => {
  if (theme?.gift) {
    return theme.gift.title || null;
  }
  return theme?.emoticon || null;
};

const SETTINGS = {
  MessageActionSetMessagesTTL: (c) => {
    const period = num(c.action.period);
    if (c.action.autoSettingFrom) {
      return plain('ttlDefault', { period: periodParam(period) });
    }
    return period > 0
      ? act(c, 'ttlSet', { period: periodParam(period) })
      : act(c, 'ttlOff');
  },
  MessageActionSetChatTheme: (c) => {
    const theme = themeOf(c.action.theme);
    return theme ? act(c, 'themeSet', { theme }) : act(c, 'themeOff');
  },
  MessageActionSetChatWallPaper: (c) => {
    if (c.action.forBoth) {
      return c.mine
        ? act(c, 'wallpaperBoth', { peer: chatPeer(c) })
        : act(c, 'wallpaperBoth');
    }
    return act(c, c.action.same ? 'wallpaperSame' : 'wallpaper');
  },
  MessageActionNoForwardsToggle: (c) =>
    act(c, c.action.newValue ? 'noFwdOn' : 'noFwdOff'),
  MessageActionNoForwardsRequest: (c) => {
    if (c.action.expired) {
      return plain('noFwdExpired');
    }
    return act(c, c.action.newValue ? 'noFwdAskOn' : 'noFwdAskOff');
  },
};

// ---- bots, payments and passport ----------------------------------------------

const botAllowedKey = (action) => {
  if (action.domain) {
    return 'botAllowedDomain';
  }
  if (action.app) {
    return 'botAllowedApp';
  }
  return action.attachMenu ? 'botAllowedMenu' : 'botAllowed';
};

const passportTypes = (values) =>
  (values ?? []).map((v) => {
    const name = String(v?.className ?? v?.type?.className ?? '').replace(
      /^SecureValueType/,
      ''
    );
    return name ? TK(`passport.${name}`) : null;
  });

const BOTS = {
  MessageActionBotAllowed: (c) =>
    plain(botAllowedKey(c.action), {
      domain: c.action.domain ?? '',
      app: c.action.app?.title ?? '',
    }),
  MessageActionWebViewDataSent: (c) =>
    plain('webView', { text: textOf(c.action.text) }),
  MessageActionWebViewDataSentMe: (c) =>
    plain('webView', { text: textOf(c.action.text) }),
  MessageActionCustomAction: (c) =>
    plain('custom', { text: textOf(c.action.message) }),
  MessageActionSecureValuesSent: (c) =>
    plain('passportSent', { types: passportTypes(c.action.types) }),
  MessageActionSecureValuesSentMe: (c) =>
    plain('passportGot', {
      actor: c.actor,
      types: passportTypes((c.action.values ?? []).map((v) => v.type ?? v)),
    }),
  MessageActionPaymentSent: (c) =>
    plain('paymentSent', {
      amount: {
        money: { currency: c.action.currency, amount: c.action.totalAmount },
      },
    }),
  MessageActionPaymentSentMe: (c) =>
    plain('paymentGot', {
      actor: c.actor,
      amount: {
        money: { currency: c.action.currency, amount: c.action.totalAmount },
      },
    }),
  MessageActionPaymentRefunded: (c) =>
    plain('paymentRefunded', {
      amount: {
        money: { currency: c.action.currency, amount: c.action.totalAmount },
      },
    }),
};

// ---- gifts --------------------------------------------------------------------

const money = (currency, amount) => ({ money: { currency, amount } });
// "…sent you a gift" or, from the user, "You sent a gift to {peer}".
const gifted = (c, base, params) =>
  act(c, base, { peer: chatPeer(c), ...params });

const uniqueName = (gift) =>
  gift?.title ? `${gift.title} #${num(gift.num)}` : null;

const uniqueKey = (action) => {
  if (action.upgrade) {
    return 'giftUniqueUpgrade';
  }
  return action.transferred ? 'giftUniqueTransfer' : 'giftUnique';
};

const priceOf = (amount) => num(amount?.amount ?? amount);

const offerKey = (action) => {
  if (action.accepted) {
    return 'offerAccepted';
  }
  return action.declined ? 'offerDeclined' : 'offer';
};

const GIFTS = {
  MessageActionGiftPremium: (c) =>
    gifted(c, 'giftPremium', {
      period: periodParam(num(c.action.days) * 86400),
      amount: money(c.action.currency, c.action.amount),
    }),
  MessageActionGiftStars: (c) =>
    gifted(c, 'giftStars', { stars: num(c.action.stars) }),
  MessageActionGiftTon: (c) =>
    gifted(c, 'giftTon', { ton: num(c.action.cryptoAmount) / 1e9 }),
  MessageActionPrizeStars: (c) =>
    plain(c.action.unclaimed ? 'prizeUnclaimed' : 'prize', {
      stars: num(c.action.stars),
    }),
  MessageActionStarGift: (c) => {
    const line = gifted(c, 'starGift', {
      gift: c.action.gift?.title || TK('giftBare'),
      stars: num(c.action.gift?.stars),
    });
    // A gift sent with its sender's name hidden comes from "someone".
    return c.action.nameHidden && !c.mine
      ? { ...line, params: { ...line.params, actor: null } }
      : line;
  },
  MessageActionStarGiftUnique: (c) => ({
    ...gifted(c, uniqueKey(c.action), {
      gift: uniqueName(c.action.gift) || TK('giftBare'),
    }),
    giftSlug: c.action.gift?.slug || null,
  }),
  MessageActionStarGiftPurchaseOffer: (c) =>
    plain(offerKey(c.action), {
      gift:
        quoted(c.action.gift?.title || uniqueName(c.action.gift)) ??
        TK('giftBare'),
      price: priceOf(c.action.price),
    }),
  MessageActionStarGiftPurchaseOfferDeclined: (c) =>
    plain(c.action.expired ? 'offerExpired' : 'offerDeclinedNow', {
      gift:
        quoted(c.action.gift?.title || uniqueName(c.action.gift)) ??
        TK('giftBare'),
      price: priceOf(c.action.price),
    }),
  MessageActionSuggestProfilePhoto: (c) => ({
    ...gifted(c, 'suggestPhoto'),
    photo: true,
  }),
  MessageActionSuggestBirthday: (c) =>
    gifted(c, 'suggestBirthday', {
      date: { birthday: c.action.birthday ?? {} },
    }),
};

// ---- polls, checklists and suggested posts ---------------------------------------

const itemTitles = (items) =>
  items.map((i) => quoted(textOf(i?.title))).filter(Boolean);

const todoItems = (c) => c.replied?.()?.raw?.media?.todo?.list ?? [];

// The tasks (by id) of the checklist the message answers.
const tasksByIds = (c, ids) => {
  const items = todoItems(c);
  return (ids ?? []).map((id) => {
    const item = items.find((i) => String(i.id) === String(id));
    return item ? quoted(textOf(item.title)) : null;
  });
};

const todoChange = (c) => {
  const done = c.action.completed ?? [];
  const undone = c.action.incompleted ?? [];
  if (done.length > 0 && undone.length > 0) {
    return act(c, 'todoBoth', {
      tasks: tasksByIds(c, done),
      other: tasksByIds(c, undone),
    });
  }
  return done.length > 0
    ? act(c, 'todoDone', { tasks: tasksByIds(c, done) })
    : act(c, 'todoUndone', { tasks: tasksByIds(c, undone) });
};

const POLLS = {
  MessageActionPollAppendAnswer: (c) =>
    act(c, 'pollAdd', { text: textOf(c.action.answer?.text) }),
  MessageActionPollDeleteAnswer: (c) =>
    act(c, 'pollDel', { text: textOf(c.action.answer?.text) }),
  MessageActionTodoAppendTasks: (c) =>
    act(c, 'todoAdd', { tasks: itemTitles(c.action.list ?? []) }),
  MessageActionTodoCompletions: todoChange,
  MessageActionSuggestedPostApproval: (c) => {
    if (!c.action.rejected) {
      return plain('suggestApproved');
    }
    return plain(c.action.balanceTooLow ? 'suggestBalance' : 'suggestRejected');
  },
  MessageActionSuggestedPostSuccess: (c) =>
    plain('suggestPaid', { price: priceOf(c.action.price) }),
  MessageActionSuggestedPostRefund: () => plain('suggestRefund'),
};

const BUILDERS = {
  ...MEMBERS,
  ...callActions,
  ...SETTINGS,
  ...BOTS,
  ...GIFTS,
  ...POLLS,
};

/** The className of every action this module words (for tests). */
export const WORDED_ACTIONS = Object.keys(BUILDERS);

/**
 * `{ key, params, photo?, giftSlug?, hidden? }` for a service link, or
 * null when this module does not word the action. `replied` is a function
 * that gives the message the service message answers (a checklist).
 */
export const serviceTextInfo = (link, replied = () => null) => {
  if (link?.service === 'MessageActionEmpty') {
    return { key: `${NS}unknown`, params: {}, hidden: true };
  }
  const build = BUILDERS[link?.service];
  return build ? (build(contextOf(link, replied)) ?? null) : null;
};
