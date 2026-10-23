// Pure helpers of the giveaway cards and the paid-message service lines
// (R-Y184; learned, never copied): what Telegram's giveaway media says as
// the page's card data, and the words of the lines about giveaways and paid
// messages in a chat's history.

const idOf = (value) => String(value?.value ?? value ?? '');
const num = (value) => Number(value?.value ?? value ?? 0) || 0;
const ids = (list) =>
  (Array.isArray(list) ? list : []).map(idOf).filter((id) => /^\d+$/.test(id));
const countries = (list) =>
  (Array.isArray(list) ? list : []).filter(
    (code) => typeof code === 'string' && /^[A-Za-z]{2}$/.test(code)
  );

/**
 * A running or finished giveaway's card from `messageMediaGiveaway`:
 * `{ kind: 'giveaway', winners, months, stars, description, channels,
 * countries, onlyNew, winnersVisible, until }`; `months` or `stars` is the
 * prize (0 for the other), `until` the end in seconds.
 */
export const giveawayOf = (media) => ({
  kind: 'giveaway',
  winners: num(media?.quantity),
  months: num(media?.months),
  stars: num(media?.stars),
  description:
    typeof media?.prizeDescription === 'string' ? media.prizeDescription : '',
  channels: ids(media?.channels),
  countries: countries(media?.countriesIso2),
  onlyNew: Boolean(media?.onlyNewSubscribers),
  winnersVisible: Boolean(media?.winnersAreVisible),
  until: num(media?.untilDate),
});

/**
 * The card of `messageMediaGiveawayResults`: `{ kind: 'giveaway-results',
 * channel, launchId, winnersCount, unclaimed, winners, months, stars,
 * description, onlyNew, refunded, until, others }`.
 */
export const giveawayResultsOf = (media) => ({
  kind: 'giveaway-results',
  channel: idOf(media?.channelId),
  launchId: num(media?.launchMsgId),
  winnersCount: num(media?.winnersCount),
  unclaimed: num(media?.unclaimedCount),
  winners: ids(media?.winners),
  months: num(media?.months),
  stars: num(media?.stars),
  description:
    typeof media?.prizeDescription === 'string' ? media.prizeDescription : '',
  onlyNew: Boolean(media?.onlyNewSubscribers),
  refunded: Boolean(media?.refunded),
  until: num(media?.untilDate),
  others: num(media?.additionalPeersCount),
});

/** The chat id of a giveaway's channel (`-100…`). */
export const channelChat = (id) => `-100${id}`;

/**
 * The prize as `{ key, params }` for the locale: Premium months or Stars
 * for each winner (`prizeMonths` / `prizeStars`).
 */
export const prizeWords = (card) =>
  card.stars > 0
    ? { key: 'chat.giveaway.prizeStars', params: { count: card.stars } }
    : {
        key: 'chat.giveaway.prizeMonths',
        params: {
          count: card.winners ?? card.winnersCount,
          months: card.months,
        },
      };

/**
 * Who takes part, as `{ key, params }`: every subscriber of the channel or
 * of several, or only those who join after the start.
 */
export const audienceWords = (card) => {
  const many = (card.channels ?? []).length > 1;
  const only = Boolean(card.onlyNew);
  const key = `chat.giveaway.audience${only ? 'New' : 'All'}${many ? 'Many' : 'One'}`;
  return { key, params: many ? { count: card.channels.length } : {} };
};

/** `{ key, params }` of the line about a service action, or null. */
export const serviceWords = (service, action = {}) => {
  switch (service) {
    case 'MessageActionGiveawayLaunch':
      return { key: 'chat.service.giveawayLaunch', params: {} };
    case 'MessageActionGiveawayResults':
      return {
        key:
          num(action.unclaimedCount) > 0
            ? 'chat.service.giveawayResultsUnclaimed'
            : 'chat.service.giveawayResults',
        params: {
          count: num(action.winnersCount),
          unclaimed: num(action.unclaimedCount),
        },
      };
    case 'MessageActionPaidMessagesPrice':
      return num(action.stars) > 0
        ? {
            key: 'chat.service.paidPrice',
            params: { count: num(action.stars) },
          }
        : { key: 'chat.service.paidPriceOff', params: {} };
    case 'MessageActionPaidMessagesRefunded':
      return {
        key: 'chat.service.paidRefunded',
        params: { count: num(action.count), stars: num(action.stars) },
      };
    default:
      return null;
  }
};

/** A date in seconds as the locale writes it (day, month, time). */
export const dateText = (seconds, locale) => {
  if (!(seconds > 0)) {
    return '';
  }
  try {
    return new Intl.DateTimeFormat(locale || undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(seconds * 1000));
  } catch {
    return new Date(seconds * 1000).toISOString();
  }
};

/** A country code as its name in the locale, else the code. */
export const countryName = (code, locale) => {
  try {
    return (
      new Intl.DisplayNames(locale ? [locale] : undefined, {
        type: 'region',
      }).of(String(code).toUpperCase()) ?? String(code)
    );
  } catch {
    return String(code);
  }
};
