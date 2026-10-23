// Collectible usernames and numbers (R-Y194; learned, never copied), as
// Telegram Desktop shows them: a username or phone number Fragment sells
// is a button in the profile; a click opens its card — when it was bought,
// the price in money and in crypto, and "Learn more" (Fragment's page, a
// new tab). Read only; asked on the click.

import React, { useEffect, useState } from 'react';
import { useDates, useLocaleContext, useT } from './i18n.js';
import { Frame } from './chat-readers.js';
import { Spinner } from './spinner.js';
import {
  collectibleItems,
  collectibleLabel,
  cryptoText,
  fiatText,
  learnUrl,
} from './apps-model.js';

const el = React.createElement;

const errorText = (t, code) => {
  const key = `chat.collectible.err.${code}`;
  const text = t(key);
  return text === key ? t('chat.collectible.err.failed') : text;
};

const useInfo = (api, item) => {
  const [state, setState] = useState({ info: null, code: null });
  useEffect(() => {
    let live = true;
    api
      .telegramCollectibleInfo({ kind: item.kind, value: item.value })
      .then(
        (answer) =>
          live &&
          setState(
            answer?.ok
              ? { info: answer, code: null }
              : { info: null, code: answer?.code ?? 'failed' }
          )
      )
      .catch(() => live && setState({ info: null, code: 'failed' }));
    return () => {
      live = false;
    };
  }, [api, item.kind, item.value]);
  return state;
};

const Row = ({ label, value, name }) =>
  el('div', { className: 'collectible-row', 'data-collectible-field': name }, [
    el('span', { key: 'l', className: 'meta' }, label),
    el('strong', { key: 'v' }, value),
  ]);

const Card = ({ info, t }) => {
  const { dateTime } = useDates();
  const { locale } = useLocaleContext();
  const learn = learnUrl(info.url);
  return el('div', { className: 'collectible-card' }, [
    el(Row, {
      key: 'd',
      name: 'date',
      label: t('chat.collectible.date'),
      value: info.date ? dateTime(info.date * 1000) : '—',
    }),
    el(Row, {
      key: 'p',
      name: 'price',
      label: t('chat.collectible.price'),
      value: info.price.currency
        ? fiatText(info.price.amount, info.price.currency, locale)
        : '—',
    }),
    info.crypto.currency
      ? el(Row, {
          key: 'c',
          name: 'crypto',
          label: t('chat.collectible.crypto'),
          value: cryptoText(info.crypto.amount, info.crypto.currency, locale),
        })
      : null,
    learn
      ? el(
          'a',
          {
            key: 'a',
            className: 'button collectible-learn',
            'data-collectible-learn': true,
            href: learn,
            target: '_blank',
            rel: 'noopener noreferrer',
          },
          t('chat.collectible.learn')
        )
      : null,
  ]);
};

/** The card of one collectible, over the page. */
export const CollectibleDialog = ({ api, item, onClose }) => {
  const t = useT();
  const { info, code } = useInfo(api, item);
  return el(
    Frame,
    {
      title: collectibleLabel(item.kind, item.value),
      close: onClose,
      name: 'collectible',
    },
    info
      ? el(Card, { info, t })
      : code
        ? el(
            'p',
            { className: 'comments-failed', role: 'alert' },
            errorText(t, code)
          )
        : el(Spinner)
  );
};

/** The profile's collectible usernames and number, as buttons. */
export const CollectibleRows = ({ api, info }) => {
  const [open, setOpen] = useState(null);
  const items = collectibleItems(info);
  if (
    items.length === 0 ||
    typeof api?.telegramCollectibleInfo !== 'function'
  ) {
    return null;
  }
  return el('div', { className: 'collectible-rows' }, [
    ...items.map((item) =>
      el(
        'button',
        {
          key: `${item.kind}:${item.value}`,
          type: 'button',
          className: 'profile-username is-collectible',
          'data-collectible': `${item.kind}:${item.value}`,
          onClick: () => setOpen(item),
        },
        collectibleLabel(item.kind, item.value)
      )
    ),
    open
      ? el(CollectibleDialog, {
          key: 'dialog',
          api,
          item: open,
          onClose: () => setOpen(null),
        })
      : null,
  ]);
};
