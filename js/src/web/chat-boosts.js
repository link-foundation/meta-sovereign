// Boosts of a channel or supergroup, as Telegram Desktop shows them
// (R-Y173; learned, never copied). The info column shows the boost level
// with its progress to the next one and the boost link with Copy. "Boost"
// gives the chat one of the user's Premium boost slots: a free slot is
// used at once; a slot that boosts another chat, or is still cooling
// down, is only reassigned after the page asks. Applying is a write made
// only on that click. Without Premium Telegram's "premium required" shows
// as text. Admins also get the list of boosters, a page at a time.

import React, { useEffect, useState } from 'react';
import { useDates, useT } from './i18n.js';
import { Icon } from './icons.js';
import { Frame } from './chat-readers.js';
import { ProgressBar, countPercent } from './progress-bar.js';

const el = React.createElement;

/** Whether the info column offers boosts: a channel or supergroup. */
export const hasBoosts = (chat, api) =>
  chat?.source === 'telegram' &&
  /^-100\d+$/.test(String(chat.chat)) &&
  typeof api?.telegramBoostsStatus === 'function';

/** Whether the user may see who boosts the chat: an admin. */
export const canSeeBoosters = (info, api) =>
  Boolean(info?.canViewStats || info?.canEdit) &&
  typeof api?.telegramBoosters === 'function';

/** The progress to the next level: `{ have, need, percent }` or null. */
export const progressOf = (status) => {
  if (!status || status.nextLevelBoosts === null) {
    return null;
  }
  const span = Math.max(1, status.nextLevelBoosts - status.currentLevelBoosts);
  const have = Math.max(0, status.boosts - status.currentLevelBoosts);
  return {
    have: status.boosts,
    need: status.nextLevelBoosts,
    percent: countPercent(have, span),
  };
};

/**
 * What a click on Boost does with the user's slots (`now` in seconds):
 * `free` (use that slot), `ask` (it boosts another chat, or cools down
 * until `cooldownUntil`), `already` (every slot boosts this chat) or
 * `none` (no slot at all).
 */
export const pickSlot = (slots, chat, now) => {
  const live = (slots ?? []).filter((s) => !s.expires || s.expires > now);
  const free = live.find((s) => !s.chat);
  if (free) {
    return { kind: 'free', slot: free.slot };
  }
  const other = live
    .filter((s) => s.chat && s.chat !== chat)
    .sort((a, b) => a.cooldownUntil - b.cooldownUntil)[0];
  if (other) {
    return {
      kind: 'ask',
      slot: other.slot,
      from: other.title,
      cooldownUntil: other.cooldownUntil > now ? other.cooldownUntil : 0,
    };
  }
  return { kind: live.length > 0 ? 'already' : 'none' };
};

const errorText = (t, code) => {
  const key = `chat.boosts.err.${code}`;
  const text = t(key);
  return text === key ? t('chat.boosts.err.failed') : text;
};

const useStatus = (api, chat) => {
  const [state, setState] = useState({ phase: 'loading' });
  const reload = () =>
    api
      .telegramBoostsStatus({ chat })
      .catch(() => null)
      .then((answer) =>
        setState(
          answer?.ok
            ? { phase: 'ready', status: answer }
            : { phase: 'error', code: answer?.code ?? 'failed' }
        )
      );
  useEffect(() => {
    setState({ phase: 'loading' });
    reload();
  }, [api, chat]);
  return [state, reload];
};

// Boost: read the slots, then apply one (or ask first).
const useBoost = (api, chat, reload) => {
  const [state, setState] = useState({ phase: 'idle' });
  const apply = async (slot) => {
    setState({ phase: 'busy' });
    const answer = await api
      .telegramBoostApply({ chat, slot })
      .catch(() => null);
    if (answer?.ok) {
      setState({ phase: 'done' });
      await reload();
    } else {
      setState({ phase: 'error', code: answer?.code ?? 'failed' });
    }
  };
  const start = async () => {
    setState({ phase: 'busy' });
    const mine = await api.telegramMyBoosts({ chat }).catch(() => null);
    if (!mine?.ok) {
      setState({ phase: 'error', code: mine?.code ?? 'failed' });
    } else if (!mine.premium) {
      setState({ phase: 'error', code: 'premium' });
    } else {
      const pick = pickSlot(mine.slots, chat, Math.floor(Date.now() / 1000));
      if (pick.kind === 'free') {
        await apply(pick.slot);
      } else if (pick.kind === 'ask') {
        setState({ phase: 'ask', pick });
      } else {
        setState({
          phase: 'error',
          code: pick.kind === 'already' ? 'already' : 'premium',
        });
      }
    }
  };
  return { state, start, apply, cancel: () => setState({ phase: 'idle' }) };
};

const useCopied = (text) => {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (copied) {
      const timer = globalThis.setTimeout(() => setCopied(false), 2000);
      return () => globalThis.clearTimeout(timer);
    }
    return undefined;
  }, [copied]);
  const copy = () =>
    Promise.resolve(globalThis.navigator?.clipboard?.writeText(text))
      .then(() => setCopied(true))
      .catch(() => {});
  return [copied, copy];
};

const Level = ({ status, t }) => {
  const progress = progressOf(status);
  return el('div', { className: 'boosts-level', 'data-boosts-level': '' }, [
    el('strong', { key: 'l' }, t('chat.boosts.level', { level: status.level })),
    el(
      'span',
      { key: 'b', className: 'meta' },
      progress
        ? t('chat.boosts.progress', {
            have: progress.have,
            need: progress.need,
          })
        : t('chat.boosts.count', { count: status.boosts })
    ),
    progress
      ? el(ProgressBar, {
          key: 'p',
          className: 'boosts-bar',
          percent: progress.percent,
          label: t('chat.boosts.progress', {
            have: progress.have,
            need: progress.need,
          }),
        })
      : null,
  ]);
};

const BoostLink = ({ url, t }) => {
  const [copied, copy] = useCopied(url);
  return url
    ? el('div', { className: 'boosts-link' }, [
        el('code', { key: 'c', className: 'invite-link-text' }, url),
        el(
          'button',
          {
            key: 'b',
            type: 'button',
            'data-action': 'boost-copy',
            onClick: copy,
          },
          [
            el(Icon, { key: 'i', name: 'copy', size: 16 }),
            ` ${copied ? t('chat.invite.copied') : t('chat.invite.copy')}`,
          ]
        ),
      ])
    : null;
};

const Ask = ({ boost, t, dateTime }) => {
  const { pick } = boost.state;
  const text = pick.cooldownUntil
    ? t('chat.boosts.askCooldown', {
        from: pick.from,
        when: dateTime(pick.cooldownUntil * 1000),
      })
    : t('chat.boosts.askMove', { from: pick.from });
  return el('div', { className: 'boosts-ask', 'data-boosts-ask': '' }, [
    el('p', { key: 't', className: 'meta' }, text),
    el('div', { key: 'b', className: 'invite-link-btns' }, [
      el(
        'button',
        {
          key: 'y',
          type: 'button',
          className: 'primary',
          'data-action': 'boost-confirm',
          onClick: () => boost.apply(pick.slot),
        },
        t('chat.boosts.confirm')
      ),
      el(
        'button',
        {
          key: 'n',
          type: 'button',
          'data-action': 'boost-cancel',
          onClick: boost.cancel,
        },
        t('chat.boosts.cancel')
      ),
    ]),
  ]);
};

const Booster = ({ item, t, dateTime }) =>
  el('li', { className: 'boosters-item', 'data-booster': item.user ?? '' }, [
    el(
      'strong',
      { key: 'n' },
      item.name ||
        (item.giveaway
          ? t('chat.boosts.giveaway')
          : item.gift
            ? t('chat.boosts.gift')
            : t('chat.boosts.unknown'))
    ),
    item.multiplier > 1
      ? el('span', { key: 'm', className: 'meta' }, ` ×${item.multiplier}`)
      : null,
    el(
      'div',
      { key: 'd', className: 'meta' },
      t('chat.boosts.until', { when: dateTime(item.expires * 1000) })
    ),
  ]);

const BoostersDialog = ({ api, chat, onClose }) => {
  const t = useT();
  const { dateTime } = useDates();
  const [state, setState] = useState({
    list: [],
    count: 0,
    next: null,
    busy: true,
    code: null,
  });
  const load = (offset) => {
    setState((s) => ({ ...s, busy: true, code: null }));
    return api
      .telegramBoosters({ chat, ...(offset ? { offset } : {}) })
      .catch(() => null)
      .then((answer) =>
        setState((s) =>
          answer?.ok
            ? {
                list: [...s.list, ...answer.boosters],
                count: answer.count,
                next: answer.next,
                busy: false,
                code: null,
              }
            : { ...s, busy: false, code: answer?.code ?? 'failed' }
        )
      );
  };
  useEffect(() => {
    load(null);
  }, [api, chat]);
  return el(
    Frame,
    { title: t('chat.boosts.boosters'), close: onClose, name: 'boosters' },
    el('div', { className: 'admin-body' }, [
      el(
        'p',
        { key: 'c', className: 'meta' },
        t('chat.boosts.boostersCount', { count: state.count })
      ),
      el(
        'ul',
        { key: 'l', className: 'boosters-list' },
        state.list.map((item, index) =>
          el(Booster, { key: `${item.user}:${index}`, item, t, dateTime })
        )
      ),
      state.busy
        ? el('p', { key: 'b', className: 'meta' }, t('chat.boosts.loading'))
        : null,
      state.code
        ? el(
            'p',
            { key: 'e', className: 'comments-failed', role: 'alert' },
            errorText(t, state.code)
          )
        : null,
      state.next && !state.busy
        ? el(
            'button',
            {
              key: 'm',
              type: 'button',
              'data-action': 'boosters-more',
              onClick: () => load(state.next),
            },
            t('chat.boosts.more')
          )
        : null,
    ])
  );
};

const Actions = ({ boost, t, admin, onBoosters }) =>
  el('div', { className: 'invite-link-btns' }, [
    el(
      'button',
      {
        key: 'b',
        type: 'button',
        className: 'primary',
        'data-action': 'boost',
        disabled: boost.state.phase === 'busy' || boost.state.phase === 'ask',
        onClick: boost.start,
      },
      t('chat.boosts.boost')
    ),
    admin
      ? el(
          'button',
          {
            key: 'l',
            type: 'button',
            'data-action': 'boosters-open',
            onClick: onBoosters,
          },
          t('chat.boosts.boosters')
        )
      : null,
  ]);

const BoostsBody = ({ api, chat, info }) => {
  const t = useT();
  const { dateTime } = useDates();
  const [status, reload] = useStatus(api, chat);
  const boost = useBoost(api, chat, reload);
  const [listing, setListing] = useState(false);
  if (status.phase === 'loading') {
    return el('p', { className: 'meta' }, t('chat.boosts.loading'));
  }
  if (status.phase === 'error') {
    return el(
      'p',
      { className: 'comments-failed', role: 'alert' },
      errorText(t, status.code)
    );
  }
  const phase = boost.state.phase;
  return el('div', { className: 'boosts', 'data-boosts': '' }, [
    el(Level, { key: 'lv', status: status.status, t }),
    el(BoostLink, { key: 'ln', url: status.status.url, t }),
    status.status.mine
      ? el('p', { key: 'm', className: 'meta' }, t('chat.boosts.mine'))
      : null,
    phase === 'ask' ? el(Ask, { key: 'ask', boost, t, dateTime }) : null,
    phase === 'error'
      ? el(
          'p',
          {
            key: 'e',
            className: 'comments-failed',
            role: 'alert',
            'data-boost-error': '',
          },
          errorText(t, boost.state.code)
        )
      : null,
    phase === 'done'
      ? el(
          'p',
          { key: 'd', className: 'meta', 'data-boost-done': '' },
          t('chat.boosts.done')
        )
      : null,
    el(Actions, {
      key: 'a',
      boost,
      t,
      admin: canSeeBoosters(info, api),
      onBoosters: () => setListing(true),
    }),
    listing
      ? el(BoostersDialog, {
          key: 'd2',
          api,
          chat,
          onClose: () => setListing(false),
        })
      : null,
  ]);
};

/** The boost level, link and Boost in the info column, or nothing. */
export const BoostsRow = ({ api, chat, info }) => {
  const t = useT();
  if (!hasBoosts(chat, api)) {
    return null;
  }
  return el('section', { className: 'person-section' }, [
    el('h3', { key: 'h' }, t('chat.boosts.title')),
    el(BoostsBody, { key: 'b', api, chat: String(chat.chat), info }),
  ]);
};
