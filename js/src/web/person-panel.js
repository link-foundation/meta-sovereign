// What a personal conversation tells about the other person (R-Y50 ..
// R-Y54), beside the open chat: how we address each other ("ты" or
// "вы", agreed or as used), their work, their accounts elsewhere — a
// GitHub account marked confirmed when it links back — and the questions
// we asked, the same question in other words counted once. Read from
// `/api/people/learned`, which learns from the stored history and reads
// the rest of it first when it is not all stored yet.

import React, { useEffect, useState } from 'react';
import { useDates, useT } from './i18n.js';
import { Icon } from './icons.js';

const el = React.createElement;
const AGAIN_MS = 10_000; // while the history is still being read

/** What the server learned about the open chat's person, or null. */
export const usePersonLearned = (api, key, open) => {
  const [learned, setLearned] = useState(null);
  useEffect(() => {
    setLearned(null);
    if (!open || !key || typeof api?.peopleLearned !== 'function') {
      return undefined;
    }
    let active = true;
    let timer = null;
    const read = () =>
      api
        .peopleLearned(key)
        .then((next) => {
          if (!active || !next || next.error) {
            return;
          }
          setLearned(next);
          if (next.complete === false) {
            timer = globalThis.setTimeout(read, AGAIN_MS);
          }
        })
        .catch(() => {});
    read();
    return () => {
      active = false;
      globalThis.clearTimeout(timer);
    };
  }, [api, key, open]);
  return learned;
};

const Section = ({ title, children }) =>
  el('section', { className: 'person-section' }, [
    el('h3', { key: 'h' }, title),
    ...React.Children.toArray(children),
  ]);

const Address = ({ address, t, dateTime }) => {
  if (!address?.form) {
    return el('p', { className: 'meta' }, t('chat.about.addressUnknown'));
  }
  const basis =
    address.basis === 'agreed'
      ? t('chat.about.agreed', { when: address.at ? dateTime(address.at) : '' })
      : t('chat.about.used', { count: address.messages ?? 0 });
  return el('p', { className: 'person-address' }, [
    el('strong', { key: 'f' }, t(`chat.about.${address.form}`)),
    el('span', { key: 'b', className: 'meta' }, ` · ${basis}`),
  ]);
};

const Work = ({ work, t }) =>
  work?.length
    ? el(
        'ul',
        { className: 'person-list' },
        work
          .slice(0, 8)
          .map((fact) =>
            el('li', { key: `${fact.kind}:${fact.value}` }, [
              el(
                'span',
                { key: 'k', className: 'meta' },
                t(`chat.about.kind.${fact.kind}`)
              ),
              ' ',
              fact.value,
            ])
          )
      )
    : el('p', { className: 'meta' }, t('chat.about.none'));

const GitHubMark = ({ github, t }) =>
  github
    ? el(
        'span',
        {
          className: `person-badge person-badge-${github.status}`,
          title: t(`chat.about.github.${github.status}`),
        },
        [
          github.status === 'confirmed'
            ? el(Icon, { key: 'i', name: 'check' })
            : null,
          t(`chat.about.github.${github.status}`),
        ]
      )
    : null;

const Accounts = ({ accounts, t }) =>
  accounts?.length
    ? el(
        'ul',
        { className: 'person-list' },
        accounts.map((account) =>
          el('li', { key: `${account.network}:${account.handle}` }, [
            el(
              'span',
              { key: 'n', className: 'meta' },
              t(`chat.about.network.${account.network}`)
            ),
            ' ',
            el(
              'a',
              {
                key: 'a',
                href: account.url,
                target: '_blank',
                rel: 'noopener noreferrer',
              },
              account.handle
            ),
            ' ',
            el(GitHubMark, { key: 'g', github: account.github, t }),
          ])
        )
      )
    : el('p', { className: 'meta' }, t('chat.about.none'));

const Asked = ({ asked, t }) =>
  asked?.length
    ? el(
        'ol',
        { className: 'person-asked' },
        asked.slice(0, 30).map((group) =>
          el('li', { key: group.text }, [
            el('div', { key: 'q', className: 'person-question' }, [
              group.text,
              group.asked > 1
                ? el(
                    'span',
                    {
                      key: 'c',
                      className: 'person-count',
                      title: group.wordings.join('\n'),
                    },
                    t('chat.about.askedTimes', { count: group.asked })
                  )
                : null,
            ]),
            el(
              'div',
              { key: 'a', className: 'person-answer meta' },
              group.answer?.text ?? t('chat.about.noAnswer')
            ),
          ])
        )
      )
    : el('p', { className: 'meta' }, t('chat.about.none'));

const Body = ({ learned, t, dateTime }) => {
  if (!learned) {
    return el('p', { className: 'meta' }, t('chat.about.loading'));
  }
  return [
    el(
      'p',
      { key: 'm', className: 'meta' },
      learned.complete === false
        ? t('chat.about.reading', { count: learned.messages })
        : t('chat.about.messages', { count: learned.messages })
    ),
    el(Section, { key: 'ad', title: t('chat.about.address') }, [
      el(Address, { key: 'x', address: learned.address, t, dateTime }),
    ]),
    el(Section, { key: 'w', title: t('chat.about.work') }, [
      el(Work, { key: 'x', work: learned.work, t }),
    ]),
    el(Section, { key: 'ac', title: t('chat.about.accounts') }, [
      el(Accounts, { key: 'x', accounts: learned.accounts, t }),
    ]),
    el(Section, { key: 'q', title: t('chat.about.asked') }, [
      el(Asked, { key: 'x', asked: learned.asked, t }),
    ]),
  ];
};

/** The panel; `onClose` hides it. */
export const PersonPanel = ({ api, chat, onClose }) => {
  const t = useT();
  const { dateTime } = useDates();
  const learned = usePersonLearned(api, chat?.key, true);
  return el(
    'aside',
    {
      className: 'person-panel',
      'aria-label': t('chat.about.title', { name: chat?.name ?? '' }),
    },
    [
      el('header', { key: 'h', className: 'person-panel-head' }, [
        el(
          'strong',
          { key: 't' },
          t('chat.about.title', { name: chat?.name ?? '' })
        ),
        el(
          'button',
          {
            key: 'x',
            type: 'button',
            className: 'icon-btn',
            'aria-label': t('chat.about.close'),
            title: t('chat.about.close'),
            onClick: onClose,
          },
          el(Icon, { name: 'close' })
        ),
      ]),
      el(
        'div',
        { key: 'b', className: 'person-panel-body' },
        el(Body, { learned, t, dateTime })
      ),
    ]
  );
};
