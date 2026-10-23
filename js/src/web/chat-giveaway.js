// Giveaways, as Telegram Desktop shows them (R-Y184; learned, never
// copied). A giveaway post is a card: its prize (Telegram Premium months or
// Stars for each winner, with the extra text the channel wrote), the number
// of winners, who takes part (the channel's subscribers, or those of
// several channels, only new ones, from some countries) and the day the
// winners are chosen. A finished one shows its results: the winners'
// number, the prizes not claimed. "Learn more" opens the details that
// payments.getGiveawayInfo gives: whether you take part, why you cannot,
// whether you won. Read only — nothing here joins, creates or changes.

import React, { useEffect, useState } from 'react';
import { useT, useLocaleContext } from './i18n.js';
import { Frame } from './chat-readers.js';
import { overPage } from './paid-portal.js';
import {
  audienceWords,
  channelChat,
  countryName,
  dateText,
  prizeWords,
} from './giveaway-model.js';

const el = React.createElement;

const errorText = (t, code) => {
  const key = `chat.giveaway.err.${code}`;
  const text = t(key);
  return text === key ? t('chat.giveaway.err.failed') : text;
};

const Row = ({ name, label, children }) =>
  el('div', { className: 'giveaway-row', 'data-giveaway-row': name }, [
    el('small', { key: 'l', className: 'meta' }, label),
    el('div', { key: 'v' }, children),
  ]);

const names = (list) => (list ?? []).map((one) => one.name).join(', ');

// What the user can read about themselves in a running giveaway.
const Status = ({ t, locale, info, hosts }) => {
  if (info.participating) {
    return t('chat.giveaway.you.in');
  }
  if (info.preparing) {
    return t('chat.giveaway.you.preparing');
  }
  if (info.joinedTooEarlyDate) {
    return t('chat.giveaway.you.early', {
      date: dateText(info.joinedTooEarlyDate, locale),
    });
  }
  if (info.disallowedChat) {
    return t('chat.giveaway.you.admin');
  }
  if (info.disallowedCountry) {
    return t('chat.giveaway.you.country', {
      country: countryName(info.disallowedCountry, locale),
    });
  }
  return t('chat.giveaway.you.join', { channels: hosts || '…' });
};

// The ended giveaway: whether the user won, and the prizes.
const Outcome = ({ t, info }) => {
  if (info.refunded) {
    return t('chat.giveaway.you.refunded');
  }
  return info.winner ? t('chat.giveaway.you.won') : t('chat.giveaway.you.lost');
};

const DetailsBody = ({ t, locale, info, card }) => [
  el(
    Row,
    {
      key: 'me',
      name: 'me',
      label: t('chat.giveaway.yourStatus'),
    },
    el(
      'span',
      {
        'data-giveaway-you': info.ended
          ? info.winner
            ? 'won'
            : 'lost'
          : info.participating
            ? 'in'
            : 'out',
      },
      info.ended
        ? el(Outcome, { t, info })
        : el(Status, { t, locale, info, hosts: names(info.channelNames) })
    )
  ),
  info.ended && info.winner && info.slug
    ? el(
        Row,
        { key: 'slug', name: 'slug', label: t('chat.giveaway.giftLink') },
        el('code', null, `https://t.me/giftcode/${info.slug}`)
      )
    : null,
  info.ended
    ? el(
        Row,
        { key: 'won', name: 'winners', label: t('chat.giveaway.winnersTitle') },
        [
          el(
            'div',
            { key: 'n' },
            t('chat.giveaway.winnersCount', { count: info.winnersCount })
          ),
          info.activatedCount !== undefined
            ? el(
                'div',
                { key: 'a', className: 'meta' },
                t('chat.giveaway.claimed', {
                  count: info.activatedCount,
                  total: info.winnersCount,
                })
              )
            : null,
          el(
            'div',
            { key: 'w', className: 'meta', 'data-giveaway-winners': '' },
            names(info.winnerNames)
          ),
        ]
      )
    : el(
        Row,
        { key: 'ch', name: 'channels', label: t('chat.giveaway.channels') },
        names(info.channelNames) ||
          t('chat.giveaway.channelsMany', { count: card.channels?.length ?? 0 })
      ),
  el(
    Row,
    { key: 'st', name: 'start', label: t('chat.giveaway.started') },
    dateText(info.startDate, locale)
  ),
  info.ended
    ? el(
        Row,
        { key: 'fi', name: 'finish', label: t('chat.giveaway.finished') },
        dateText(info.finishDate, locale)
      )
    : null,
];

/** The details of one giveaway, asked of Telegram when opened. */
export const GiveawayDetails = ({ api, chat, msgId, card, close }) => {
  const t = useT();
  const { locale } = useLocaleContext();
  const [state, setState] = useState({ phase: 'loading' });
  useEffect(() => {
    let live = true;
    Promise.resolve(
      api?.telegramGiveawayInfo?.({
        chat: String(chat),
        id: msgId,
        channels: card.channels,
        winners: card.winners,
      })
    )
      .then((answer) => {
        if (live) {
          setState(
            answer?.ok
              ? { phase: 'ready', info: answer }
              : { phase: 'error', code: answer?.code ?? 'failed' }
          );
        }
      })
      .catch(() => live && setState({ phase: 'error', code: 'failed' }));
    return () => {
      live = false;
    };
  }, [api, chat, msgId]);
  return overPage(
    el(
      Frame,
      { title: t('chat.giveaway.title'), close, name: 'giveaway' },
      state.phase === 'ready'
        ? el(
            'div',
            { className: 'giveaway-details' },
            DetailsBody({ t, locale, info: state.info, card })
          )
        : el(
            'p',
            {
              className: 'meta',
              role: state.phase === 'error' ? 'alert' : null,
            },
            state.phase === 'error'
              ? errorText(t, state.code)
              : t('chat.giveaway.loading')
          )
    )
  );
};

const LearnMore = ({ api, chat, msgId, card }) => {
  const t = useT();
  const [open, setOpen] = useState(false);
  const usable =
    chat && msgId && typeof api?.telegramGiveawayInfo === 'function';
  return el(React.Fragment, null, [
    el(
      'button',
      {
        key: 'b',
        type: 'button',
        className: 'giveaway-more',
        'data-action': 'giveaway-more',
        disabled: !usable,
        onClick: () => setOpen(true),
      },
      t('chat.giveaway.more')
    ),
    open
      ? el(GiveawayDetails, {
          key: 'd',
          api,
          chat,
          msgId,
          card,
          close: () => setOpen(false),
        })
      : null,
  ]);
};

const Prize = ({ t, card }) => {
  const words = prizeWords(card);
  return el('div', { 'data-giveaway-prize': '' }, [
    card.description
      ? el(
          'div',
          { key: 'd', className: 'giveaway-extra' },
          t('chat.giveaway.extra', { text: card.description })
        )
      : null,
    el('div', { key: 'p' }, t(words.key, words.params)),
  ]);
};

/** A running giveaway's card. */
export const GiveawayCard = ({ media, api, chat, msgId }) => {
  const t = useT();
  const { locale } = useLocaleContext();
  const audience = audienceWords(media);
  return el(
    'div',
    {
      className: 'bubble-card giveaway-card',
      'data-giveaway': 'running',
    },
    [
      el('strong', { key: 't' }, t('chat.giveaway.title')),
      el(
        Row,
        { key: 'pr', name: 'prize', label: t('chat.giveaway.prizes') },
        el(Prize, { t, card: media })
      ),
      el(
        Row,
        { key: 'pa', name: 'audience', label: t('chat.giveaway.participants') },
        [
          el('div', { key: 'a' }, t(audience.key, audience.params)),
          media.countries.length > 0
            ? el(
                'div',
                { key: 'c', className: 'meta' },
                t('chat.giveaway.countries', {
                  list: media.countries
                    .map((code) => countryName(code, locale))
                    .join(', '),
                })
              )
            : null,
        ]
      ),
      el(
        Row,
        { key: 'u', name: 'until', label: t('chat.giveaway.selection') },
        dateText(media.until, locale)
      ),
      el(LearnMore, { key: 'm', api, chat, msgId, card: media }),
    ]
  );
};

/** A finished giveaway's results card. */
export const GiveawayResultsCard = ({ media, api, chat }) => {
  const t = useT();
  const { locale } = useLocaleContext();
  const card = { ...media, winners: media.winners };
  const host = media.channel ? channelChat(media.channel) : String(chat ?? '');
  return el(
    'div',
    {
      className: 'bubble-card giveaway-card',
      'data-giveaway': 'results',
    },
    [
      el('strong', { key: 't' }, t('chat.giveaway.endedTitle')),
      el(
        'div',
        { key: 'n', 'data-giveaway-winners-count': media.winnersCount },
        media.refunded
          ? t('chat.giveaway.refundedLine')
          : t('chat.giveaway.winnersSelected', { count: media.winnersCount })
      ),
      media.unclaimed > 0
        ? el(
            'div',
            { key: 'u', className: 'meta' },
            t('chat.giveaway.unclaimed', { count: media.unclaimed })
          )
        : null,
      el(
        Row,
        { key: 'pr', name: 'prize', label: t('chat.giveaway.prizes') },
        el(Prize, {
          t,
          card: { ...media, winners: media.winnersCount },
        })
      ),
      el(
        Row,
        { key: 'd', name: 'ended', label: t('chat.giveaway.selection') },
        dateText(media.until, locale)
      ),
      el(LearnMore, {
        key: 'm',
        api,
        chat: host,
        msgId: media.launchId,
        card: { ...card, channels: [media.channel].filter(Boolean) },
      }),
    ]
  );
};
