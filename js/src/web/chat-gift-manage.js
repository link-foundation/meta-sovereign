// A received gift's dialog, as Telegram Desktop has it (R-Y193; learned,
// never copied): who sent it, the message, the date and what it converts
// to. On the user's own profile: "Show on / Hide from my profile", "Convert
// to N ⭐", "Upgrade" (the preview of what it may become and the price;
// free when prepaid), "Transfer" (a unique gift: pick a contact, then
// confirm; Stars or free), "Pin to top" (up to Telegram's limit) and, for a
// unique gift, "View". Each write waits for its own confirmation inside
// the dialog; another person's gifts open read-only. A paid upgrade or
// transfer is refused by the server when the form's price is not the one
// shown.

import React, { useEffect, useMemo, useState } from 'react';
import { useDates, useT } from './i18n.js';
import { Frame } from './chat-readers.js';
import { Picture } from './chat-stickers.js';
import { PeerAvatar } from './peer-avatar.js';
import { filterContacts, sortContacts } from './chat-contacts-window.js';
import {
  giftActions,
  giftRef,
  pinnedAfter,
  priceWords,
  rarityWords,
  transferWaits,
  openUniqueGift,
} from './gift-manage-model.js';

const el = React.createElement;

/** The words of a failure code, else the general failure. */
export const errorText = (t, code) => {
  const key = `chat.giftManage.err.${code}`;
  const text = t(key);
  return text === key ? t('chat.giftManage.err.failed') : text;
};

/** A rarity as text. */
export const Rarity = ({ t, item }) => {
  const words = rarityWords(item);
  if (!words) {
    return null;
  }
  return el(
    'span',
    { className: 'meta gift-rarity' },
    words.text ?? t(words.key)
  );
};

const Sticker = ({ api, gift }) =>
  gift.sticker
    ? el(Picture, { api, item: gift.sticker })
    : el('span', { className: 'sticker-empty' }, '🎁');

// One question and its two answers; the write waits for the first.
const Confirm = ({ t, name, text, label, busy, onYes, onNo }) =>
  el(
    'div',
    { className: 'gift-confirm', role: 'group', 'data-gift-ask': name },
    [
      el('p', { key: 't', 'data-gift-ask-text': '' }, text),
      el('div', { key: 'b', className: 'gift-actions' }, [
        el(
          'button',
          {
            key: 'y',
            type: 'button',
            className: 'primary',
            'data-action': 'gift-confirm',
            disabled: busy,
            onClick: onYes,
          },
          label
        ),
        el(
          'button',
          {
            key: 'n',
            type: 'button',
            'data-action': 'gift-cancel',
            disabled: busy,
            onClick: onNo,
          },
          t('chat.giftManage.cancel')
        ),
      ]),
    ]
  );

// What an upgrade may become, asked when the step opens.
const usePreview = (api, giftId) => {
  const [state, setState] = useState({ busy: true, preview: null, code: null });
  useEffect(() => {
    let live = true;
    Promise.resolve(api.telegramGiftUpgradePreview({ giftId }))
      .catch(() => null)
      .then(
        (a) =>
          live &&
          setState(
            a?.ok
              ? { busy: false, preview: a, code: null }
              : { busy: false, preview: null, code: a?.code ?? 'failed' }
          )
      );
    return () => {
      live = false;
    };
  }, [api, giftId]);
  return state;
};

const Names = ({ t, label, list, kind }) =>
  list.length > 0
    ? el('div', { className: 'gift-attrs', 'data-gift-attrs': kind }, [
        el('small', { key: 'l', className: 'meta' }, label),
        el(
          'ul',
          { key: 'u', className: 'gift-attr-list' },
          list.map((one, index) =>
            el('li', { key: `${one.name}:${index}` }, [
              el('span', { key: 'n' }, one.name),
              ' ',
              el(Rarity, { key: 'r', t, item: one }),
            ])
          )
        ),
      ])
    : null;

const UpgradeStep = ({ t, api, gift, busy, onYes, onNo }) => {
  const { preview, busy: loading, code } = usePreview(api, gift.giftId);
  const price = priceWords(gift.upgradeStars);
  return el('div', { className: 'gift-upgrade', 'data-gift-upgrade': '' }, [
    loading
      ? el('p', { key: 'l', className: 'meta' }, t('chat.giftManage.loading'))
      : null,
    code
      ? el(
          'p',
          { key: 'e', className: 'comments-failed', role: 'alert' },
          errorText(t, code)
        )
      : null,
    preview
      ? el('div', { key: 'p', 'data-gift-preview': '' }, [
          el(Names, {
            key: 'm',
            t,
            kind: 'models',
            label: t('chat.giftManage.models'),
            list: preview.models,
          }),
          el(Names, {
            key: 'b',
            t,
            kind: 'backdrops',
            label: t('chat.giftManage.backdrops'),
            list: preview.backdrops,
          }),
          el(Names, {
            key: 'y',
            t,
            kind: 'patterns',
            label: t('chat.giftManage.patterns'),
            list: preview.patterns,
          }),
        ])
      : null,
    el(Confirm, {
      key: 'c',
      t,
      name: 'upgrade',
      text: t('chat.giftManage.confirmUpgrade', {
        price: t(price.key, price.params),
      }),
      label: t('chat.giftManage.upgradeFor', {
        price: t(price.key, price.params),
      }),
      busy: busy || loading,
      onYes,
      onNo,
    }),
  ]);
};

// The contacts to give a unique gift to.
const useContacts = (api) => {
  const [state, setState] = useState({ busy: true, list: [] });
  useEffect(() => {
    let live = true;
    Promise.resolve(api.telegramChatContacts?.())
      .catch(() => null)
      .then(
        (a) => live && setState({ busy: false, list: a?.ok ? a.contacts : [] })
      );
    return () => {
      live = false;
    };
  }, [api]);
  return state;
};

const PickStep = ({ t, api, onPick, onNo }) => {
  const [query, setQuery] = useState('');
  const { busy, list } = useContacts(api);
  const shown = useMemo(
    () => sortContacts(filterContacts(list, query), 'name'),
    [list, query]
  );
  return el('div', { className: 'gift-pick', 'data-gift-pick': '' }, [
    el('input', {
      key: 'q',
      type: 'search',
      className: 'chat-search',
      'data-field': 'gift-contact-search',
      placeholder: t('chat.contacts.search'),
      'aria-label': t('chat.contacts.search'),
      value: query,
      onChange: (e) => setQuery(e.target.value),
    }),
    busy
      ? el('p', { key: 'l', className: 'meta' }, t('chat.contacts.loading'))
      : null,
    !busy && shown.length === 0
      ? el('p', { key: 'n', className: 'meta' }, t('chat.contacts.none'))
      : null,
    el(
      'ul',
      { key: 'u', className: 'member-list contacts-list' },
      shown.map((contact) =>
        el(
          'li',
          { key: contact.id, className: 'contact-row' },
          el(
            'button',
            {
              type: 'button',
              className: 'member-open',
              'data-gift-contact': contact.id,
              onClick: () => onPick(contact),
            },
            [
              el(PeerAvatar, {
                key: 'a',
                api,
                source: 'telegram',
                peer: contact.id,
                name: contact.name,
                size: 's',
              }),
              el('span', { key: 'n', className: 'member-name' }, contact.name),
            ]
          )
        )
      )
    ),
    el(
      'button',
      {
        key: 'x',
        type: 'button',
        'data-action': 'gift-cancel',
        onClick: onNo,
      },
      t('chat.giftManage.cancel')
    ),
  ]);
};

const Info = ({ t, dateTime, gift, api }) => [
  el('div', { key: 's', className: 'gift-big' }, el(Sticker, { api, gift })),
  gift.unique
    ? el(
        'p',
        { key: 'u', className: 'meta', 'data-gift-unique': gift.unique.slug },
        `${gift.unique.title} #${gift.unique.num}`
      )
    : null,
  el(
    'p',
    { key: 'v', 'data-gift-stars': gift.stars },
    t('chat.stars.giftValue', { count: gift.stars })
  ),
  el(
    'p',
    { key: 'f', className: 'meta' },
    gift.anonymous
      ? t('chat.stars.fromAnonymous')
      : t('chat.stars.from', { name: gift.fromName })
  ),
  el('p', { key: 'd', className: 'meta' }, dateTime(gift.date * 1000)),
  gift.text ? el('p', { key: 't', className: 'gift-text' }, gift.text) : null,
  gift.hidden
    ? el(
        'p',
        { key: 'h', className: 'meta', 'data-gift-hidden': '' },
        t('chat.stars.hiddenNote')
      )
    : null,
  gift.pinned
    ? el(
        'p',
        { key: 'p', className: 'meta', 'data-gift-pinned': '' },
        t('chat.giftManage.pinnedNote')
      )
    : null,
];

const Button = ({ name, label, onClick, disabled }) =>
  el(
    'button',
    {
      type: 'button',
      'data-action': name,
      disabled: Boolean(disabled),
      onClick,
    },
    label
  );

const Actions = ({ t, gift, can, now, setStep }) =>
  el('div', { className: 'gift-actions' }, [
    can.toggle
      ? el(Button, {
          key: 'tg',
          name: 'gift-toggle',
          label: gift.hidden
            ? t('chat.giftManage.show')
            : t('chat.giftManage.hide'),
          onClick: () => setStep('toggle'),
        })
      : null,
    can.convert
      ? el(Button, {
          key: 'cv',
          name: 'gift-convert',
          label: t('chat.giftManage.convert', { count: gift.convertStars }),
          onClick: () => setStep('convert'),
        })
      : null,
    can.upgrade
      ? el(Button, {
          key: 'up',
          name: 'gift-upgrade',
          label: t('chat.giftManage.upgrade'),
          onClick: () => setStep('upgrade'),
        })
      : null,
    can.transfer
      ? el(Button, {
          key: 'tr',
          name: 'gift-transfer',
          label: t('chat.giftManage.transfer'),
          disabled: transferWaits(gift, now),
          onClick: () => setStep('pick'),
        })
      : null,
    can.pin
      ? el(Button, {
          key: 'pn',
          name: 'gift-pin',
          label: gift.pinned
            ? t('chat.giftManage.unpin')
            : t('chat.giftManage.pin'),
          onClick: () => setStep('pin'),
        })
      : null,
    can.view
      ? el(Button, {
          key: 'vw',
          name: 'gift-view',
          label: t('chat.giftManage.view'),
          onClick: () => openUniqueGift(gift.unique.slug),
        })
      : null,
  ]);

// What each confirmed step asks of the server, and what the dialog does
// with the answer.
const doStep = (api, step, { gift, chat, gifts, target }) => {
  const ref = giftRef(gift, chat);
  switch (step) {
    case 'toggle':
      return api.telegramStarGiftSave({
        chat: ref.chat,
        msgId: gift.msgId,
        unsave: !gift.hidden,
      });
    case 'convert':
      return api.telegramGiftConvert(ref);
    case 'upgrade':
      return api.telegramGiftUpgrade({ ...ref, stars: gift.upgradeStars });
    case 'transfer':
      return api.telegramGiftTransfer({
        ...ref,
        to: target.id,
        stars: gift.transferStars,
      });
    default:
      return api.telegramGiftPin({
        chat: ref.chat,
        pins: pinnedAfter(gifts, gift, !gift.pinned),
      });
  }
};

const confirmText = (t, step, gift, target) => {
  if (step === 'toggle') {
    return gift.hidden
      ? t('chat.giftManage.confirmShow')
      : t('chat.giftManage.confirmHide');
  }
  if (step === 'convert') {
    return t('chat.giftManage.confirmConvert', { count: gift.convertStars });
  }
  if (step === 'transfer') {
    const price = priceWords(gift.transferStars);
    return t('chat.giftManage.confirmTransfer', {
      name: target?.name ?? '',
      price: t(price.key, price.params),
    });
  }
  return gift.pinned
    ? t('chat.giftManage.confirmUnpin')
    : t('chat.giftManage.confirmPin');
};

const confirmLabel = (t, step, gift) => {
  switch (step) {
    case 'toggle':
      return gift.hidden
        ? t('chat.giftManage.show')
        : t('chat.giftManage.hide');
    case 'convert':
      return t('chat.giftManage.convertYes');
    case 'transfer':
      return t('chat.giftManage.transferYes');
    default:
      return gift.pinned
        ? t('chat.giftManage.unpin')
        : t('chat.giftManage.pin');
  }
};

// What the dialog's owner is told after a step is done.
const afterStep = (step, gift, answer, { onPatch, onRemove, onReload }) => {
  if (step === 'toggle') {
    onPatch({ hidden: Boolean(answer.hidden) });
  } else if (step === 'pin') {
    onPatch({ pinned: !gift.pinned });
  } else if (step === 'upgrade') {
    onReload();
  } else {
    onRemove();
  }
};

/**
 * The dialog of one gift. `gifts` is the list it is in (for the pinned
 * ones); `onPatch(fields)` changes this gift, `onRemove()` drops it (it was
 * converted or given away) and `onReload()` asks the list again.
 */
export const GiftDialog = ({
  gift,
  gifts,
  mine,
  api,
  chat,
  onClose,
  onPatch,
  onRemove,
  onReload,
  now = Date.now(),
}) => {
  const t = useT();
  const { dateTime } = useDates();
  const [step, setStep] = useState(null);
  const [target, setTarget] = useState(null);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState(null);
  const [limit, setLimit] = useState(null);
  const can = giftActions(gift, mine);
  const cancel = () => setStep(null);
  const confirm = async () => {
    setBusy(true);
    setCode(null);
    const answer = await Promise.resolve(
      doStep(api, step, { gift, chat, gifts, target })
    ).catch(() => null);
    setBusy(false);
    if (answer?.ok) {
      setStep(null);
      afterStep(step, gift, answer, { onPatch, onRemove, onReload });
    } else {
      setStep(null);
      setLimit(answer?.limit ?? null);
      setCode(answer?.code ?? 'failed');
    }
  };
  const asking = ['toggle', 'convert', 'transfer', 'pin'].includes(step);
  return el(
    Frame,
    { title: gift.title || t('chat.stars.gift'), close: onClose, name: 'gift' },
    el('div', { className: 'admin-body gift-detail' }, [
      ...Info({ t, dateTime, gift, api }),
      code
        ? el(
            'p',
            { key: 'e', className: 'comments-failed', role: 'alert' },
            code === 'pin-limit'
              ? t('chat.giftManage.err.pin-limit', { count: limit ?? 6 })
              : errorText(t, code)
          )
        : null,
      step === null
        ? el(Actions, { key: 'a', t, gift, can, now, setStep })
        : null,
      step === 'pick'
        ? el(PickStep, {
            key: 'k',
            t,
            api,
            onPick: (contact) => {
              setTarget(contact);
              setStep('transfer');
            },
            onNo: cancel,
          })
        : null,
      step === 'upgrade'
        ? el(UpgradeStep, {
            key: 'u',
            t,
            api,
            gift,
            busy,
            onYes: confirm,
            onNo: cancel,
          })
        : null,
      asking
        ? el(Confirm, {
            key: 'c',
            t,
            name: step,
            text: confirmText(t, step, gift, target),
            label: confirmLabel(t, step, gift),
            busy,
            onYes: confirm,
            onNo: cancel,
          })
        : null,
    ])
  );
};
