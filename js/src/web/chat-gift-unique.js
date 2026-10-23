// A unique (collectible) gift's viewer and a gift code's dialog, as
// Telegram Desktop has them (R-Y193; learned, never copied).
// - The viewer shows a unique gift's model, backdrop, symbol (pattern),
//   number, owner and how many exist (issued of total). It opens from a
//   gift, from a t.me/nft/<slug> link in a chat. Read only.
// - The gift code dialog shows what payments.checkGiftCode says: the
//   months of Premium, who gave it, the date and whether it was used. Its
//   Apply asks "Activate Telegram Premium for N months?" and only that
//   confirmation's button activates it. A t.me/giftcode/<slug> link and a
//   gift code message open it.
// Both are opened by `GiftHost`, mounted once in the app.

import React, { useEffect, useRef, useState } from 'react';
import { useDates, useT } from './i18n.js';
import { Frame } from './chat-readers.js';
import { Picture } from './chat-stickers.js';
import { errorText, Rarity } from './chat-gift-manage.js';
import {
  GIFT_EVENT,
  availability,
  backdropStyle,
} from './gift-manage-model.js';

const el = React.createElement;

// What one asking of the server answers: `{ busy, answer, code }`.
const useAsked = (ask, deps) => {
  const [state, setState] = useState({ busy: true, answer: null, code: null });
  useEffect(() => {
    let live = true;
    setState({ busy: true, answer: null, code: null });
    Promise.resolve(ask())
      .catch(() => null)
      .then(
        (a) =>
          live &&
          setState(
            a?.ok
              ? { busy: false, answer: a, code: null }
              : { busy: false, answer: null, code: a?.code ?? 'failed' }
          )
      );
    return () => {
      live = false;
    };
  }, deps);
  return state;
};

const Row = ({ name, label, children }) =>
  el('div', { className: 'giveaway-row', 'data-unique-row': name }, [
    el('small', { key: 'l', className: 'meta' }, label),
    el('div', { key: 'v' }, children),
  ]);

const Attribute = ({ t, name, label, item }) =>
  item
    ? el(Row, { name, label }, [
        item.name,
        ' ',
        el(Rarity, { key: 'r', t, item }),
      ])
    : null;

const Failure = ({ t, code }) =>
  code
    ? el(
        'p',
        { className: 'comments-failed', role: 'alert' },
        errorText(t, code)
      )
    : null;

const UniqueBody = ({ t, api, gift }) => {
  const free = availability(gift);
  return el('div', { className: 'admin-body unique-gift' }, [
    el(
      'div',
      {
        key: 'h',
        className: 'unique-hero',
        style: backdropStyle(gift.backdrop),
        'data-unique-hero': gift.slug,
      },
      [
        gift.model?.sticker
          ? el(
              'div',
              { key: 's', className: 'gift-big' },
              el(Picture, { api, item: gift.model.sticker })
            )
          : null,
        el('strong', { key: 't' }, gift.title),
        el('div', { key: 'n', 'data-unique-num': gift.num }, `#${gift.num}`),
      ]
    ),
    el(Attribute, {
      key: 'm',
      t,
      name: 'model',
      label: t('chat.giftManage.model'),
      item: gift.model,
    }),
    el(Attribute, {
      key: 'b',
      t,
      name: 'backdrop',
      label: t('chat.giftManage.backdrop'),
      item: gift.backdrop,
    }),
    el(Attribute, {
      key: 'p',
      t,
      name: 'pattern',
      label: t('chat.giftManage.pattern'),
      item: gift.pattern,
    }),
    gift.owner.name
      ? el(
          Row,
          { key: 'o', name: 'owner', label: t('chat.giftManage.owner') },
          gift.owner.name
        )
      : null,
    free
      ? el(
          Row,
          {
            key: 'a',
            name: 'availability',
            label: t('chat.giftManage.issued'),
          },
          t('chat.giftManage.issuedOf', free)
        )
      : null,
  ]);
};

/** The viewer of the unique gift `slug`. */
export const UniqueViewer = ({ api, slug, close }) => {
  const t = useT();
  const { busy, answer, code } = useAsked(
    () => api.telegramGiftUnique({ slug }),
    [api, slug]
  );
  return el(
    Frame,
    {
      title: answer?.gift?.title ?? t('chat.giftManage.uniqueTitle'),
      close,
      name: 'unique-gift',
    },
    [
      busy
        ? el('p', { key: 'l', className: 'meta' }, t('chat.giftManage.loading'))
        : null,
      el(Failure, { key: 'e', t, code }),
      answer ? el(UniqueBody, { key: 'b', t, api, gift: answer.gift }) : null,
    ]
  );
};

const CodeBody = ({ t, dateTime, info }) =>
  el(
    'div',
    { className: 'admin-body gift-code', 'data-gift-code': info.slug },
    [
      el(
        'p',
        { key: 'm', 'data-code-months': info.months },
        t('chat.giftManage.codeMonths', { count: info.months })
      ),
      info.from?.name
        ? el(
            'p',
            { key: 'f', className: 'meta', 'data-code-from': info.from.id },
            t(
              info.viaGiveaway
                ? 'chat.giftManage.codeFromGiveaway'
                : 'chat.giftManage.codeFrom',
              { name: info.from.name }
            )
          )
        : null,
      el('p', { key: 'd', className: 'meta' }, dateTime(info.date * 1000)),
      info.used
        ? el(
            'p',
            { key: 'u', className: 'meta', 'data-code-used': '' },
            t('chat.giftManage.codeUsed', {
              date: dateTime(info.usedDate * 1000),
            })
          )
        : null,
    ]
  );

/** The dialog of the gift code `slug`; Apply is the one write. */
export const GiftCodeDialog = ({ api, slug, close }) => {
  const t = useT();
  const { dateTime } = useDates();
  const { busy, answer, code } = useAsked(
    () => api.telegramGiftCodeCheck({ slug }),
    [api, slug]
  );
  const [step, setStep] = useState(null); // null, 'ask', 'done'
  const [working, setWorking] = useState(false);
  const [failed, setFailed] = useState(null);
  const info = answer?.info;
  const apply = async () => {
    setWorking(true);
    const done = await Promise.resolve(
      api.telegramGiftCodeApply({ slug })
    ).catch(() => null);
    setWorking(false);
    setFailed(done?.ok ? null : (done?.code ?? 'failed'));
    setStep(done?.ok ? 'done' : null);
  };
  return el(
    Frame,
    { title: t('chat.giftManage.codeTitle'), close, name: 'gift-code' },
    [
      busy
        ? el('p', { key: 'l', className: 'meta' }, t('chat.giftManage.loading'))
        : null,
      el(Failure, { key: 'e', t, code: code ?? failed }),
      info ? el(CodeBody, { key: 'b', t, dateTime, info }) : null,
      step === 'done'
        ? el(
            'p',
            { key: 'ok', 'data-code-applied': '' },
            t('chat.giftManage.codeApplied', { count: info.months })
          )
        : null,
      info && !info.used && step === null
        ? el(
            'button',
            {
              key: 'a',
              type: 'button',
              className: 'primary',
              'data-action': 'gift-code-apply',
              onClick: () => setStep('ask'),
            },
            t('chat.giftManage.codeApply')
          )
        : null,
      step === 'ask'
        ? el(
            'div',
            {
              key: 'q',
              className: 'gift-confirm',
              'data-gift-ask': 'code-apply',
            },
            [
              el(
                'p',
                { key: 't' },
                t('chat.giftManage.confirmCode', { count: info.months })
              ),
              el('div', { key: 'b', className: 'gift-actions' }, [
                el(
                  'button',
                  {
                    key: 'y',
                    type: 'button',
                    className: 'primary',
                    'data-action': 'gift-confirm',
                    disabled: working,
                    onClick: apply,
                  },
                  t('chat.giftManage.codeActivate')
                ),
                el(
                  'button',
                  {
                    key: 'n',
                    type: 'button',
                    'data-action': 'gift-cancel',
                    disabled: working,
                    onClick: () => setStep(null),
                  },
                  t('chat.giftManage.cancel')
                ),
              ]),
            ]
          )
        : null,
    ]
  );
};

/** Mounted once: opens the viewer or the code dialog a link or button asks. */
export const GiftHost = ({ api }) => {
  const [open, setOpen] = useState([]);
  const count = useRef(0);
  useEffect(() => {
    const on = (event) => {
      event.detail.handled = true;
      count.current += 1;
      const { kind, slug } = event.detail;
      setOpen((list) => [...list, { kind, slug, id: count.current }]);
    };
    globalThis.addEventListener?.(GIFT_EVENT, on);
    return () => globalThis.removeEventListener?.(GIFT_EVENT, on);
  }, []);
  const close = (id) => setOpen((list) => list.filter((one) => one.id !== id));
  return el(
    React.Fragment,
    null,
    open.map((one) =>
      el(one.kind === 'code' ? GiftCodeDialog : UniqueViewer, {
        key: one.id,
        api,
        slug: one.slug,
        close: () => close(one.id),
      })
    )
  );
};
