import React from 'react';
import { useT } from './i18n.js';

const el = React.createElement;
const initial = { source: '', chat: '', self: '', limit: '10000' };
const useFollow = (api) => {
  const [fields, setFields] = React.useState(initial);
  const [data, setData] = React.useState(null);
  const [busy, setBusy] = React.useState('');
  const [notice, setNotice] = React.useState(null);
  const [ask, setAsk] = React.useState(false);
  const generation = React.useRef(0);
  React.useEffect(
    () => () => {
      generation.current++;
    },
    []
  );
  const filters = () => ({
    ...(fields.source.trim() ? { source: fields.source.trim() } : {}),
    ...(fields.chat.trim() ? { chat: fields.chat.trim() } : {}),
  });
  const perform = async (action, offset = 0) => {
    if (busy) {
      return;
    }
    const turn = ++generation.current;
    setBusy(action);
    setAsk(false);
    setNotice(null);
    try {
      if (action === 'extract') {
        const result = await api.extractFollowLinks({
          ...filters(),
          limit: fields.limit,
          self: fields.self
            .split(',')
            .map((v) => v.trim())
            .filter(Boolean),
        });
        if (turn !== generation.current) {
          return;
        }
        setNotice({ kind: 'extracted', ...result });
      } else if (action === 'clear') {
        const result = await api.clearFollowLinks(filters());
        if (turn !== generation.current) {
          return;
        }
        setData(null);
        setNotice({ kind: 'cleared', ...result });
      }
      const result = await api.followLinks({ ...filters(), offset, limit: 25 });
      if (turn === generation.current) {
        setData(result);
      }
    } catch {
      if (turn === generation.current) {
        setNotice({ kind: 'failed' });
      }
    } finally {
      if (turn === generation.current) {
        setBusy('');
      }
    }
  };
  const change = (key, value) => {
    if (busy) {
      return;
    }
    generation.current++;
    setFields((old) => ({ ...old, [key]: value }));
    setData(null);
    setNotice(null);
    setAsk(false);
  };
  return { fields, data, busy, notice, ask, setAsk, perform, change };
};

const Fields = ({ state, t }) =>
  el('fieldset', { className: 'col', disabled: Boolean(state.busy) }, [
    el('legend', { key: 'l' }, t('follow.scope')),
    ...Object.entries(state.fields).map(([key, value]) =>
      el('label', { key, className: 'field' }, [
        el('span', { key: 'l', className: 'field-label' }, t(`follow.${key}`)),
        el('input', {
          key: 'i',
          value,
          'aria-label': t(`follow.${key}`),
          type: key === 'limit' ? 'number' : 'text',
          ...(key === 'limit'
            ? { min: 0, max: 1000000, step: 1 }
            : { maxLength: 1024 }),
          onChange: (event) => state.change(key, event.target.value),
        }),
      ])
    ),
    el('small', { key: 'h', className: 'meta' }, t('follow.filterHint')),
  ]);

const Reference = ({ link, t }) =>
  el(
    'article',
    {
      className: 'card col',
      'data-follow-reference': link.id,
      style: { overflowWrap: 'anywhere', minWidth: 0 },
    },
    [
      el(
        'a',
        { key: 'u', href: link.url, target: '_blank', rel: 'noreferrer' },
        link.url
      ),
      el(
        'span',
        { key: 'k', className: 'meta' },
        t(`follow.kind.${link.kind}`)
      ),
      el(
        'span',
        { key: 'p', className: 'meta' },
        t('follow.provenance', {
          source: link.source,
          chat: link.chat,
          sender: link.sender,
        })
      ),
      el('code', { key: 'm' }, link.messageId),
    ]
  );

const Notice = ({ notice, t }) => {
  if (!notice) {
    return null;
  }
  if (notice.kind === 'extracted') {
    const coverage = notice.coverage;
    return el('div', { role: 'status', className: 'col' }, [
      el(
        'span',
        { key: 's' },
        t('follow.extracted', {
          added: notice.added,
          found: notice.found,
          scanned: coverage.scanned,
          messages: coverage.messages,
        })
      ),
      coverage.limited
        ? el(
            'span',
            { key: 'l' },
            t('follow.limited', {
              count: coverage.truncatedMessages,
            })
          )
        : null,
    ]);
  }
  return el(
    'p',
    { role: notice.kind === 'failed' ? 'alert' : 'status' },
    t(`follow.${notice.kind}`, { count: notice.cleared })
  );
};

export const FollowControls = ({ api }) => {
  const t = useT();
  const state = useFollow(api);
  const button = (key, onClick, disabled = false) =>
    el(
      'button',
      {
        key,
        type: 'button',
        onClick,
        disabled: Boolean(state.busy) || disabled,
        'data-follow-action': key,
      },
      t(`follow.${key}`)
    );
  const data = state.data;
  return el(
    'details',
    {
      className: 'card',
      'data-follow-panel': true,
      onToggle: (event) => {
        if (
          event.target === event.currentTarget &&
          event.currentTarget.open &&
          !data &&
          !state.busy
        ) {
          void state.perform('load');
        }
      },
    },
    [
      el(
        'summary',
        { key: 's', style: { scrollMarginTop: 72 } },
        t('follow.title')
      ),
      el(
        'div',
        { key: 'c', className: 'col', 'aria-busy': Boolean(state.busy) },
        [
          el('p', { key: 'h', className: 'meta' }, t('follow.hint')),
          el(Fields, { key: 'f', state, t }),
          el(
            'div',
            { key: 'a', className: 'row', style: { flexWrap: 'wrap' } },
            [
              button('load', () => state.perform('load')),
              button('extract', () => state.perform('extract')),
              button('clear', () => state.setAsk(true), !data?.total),
            ]
          ),
          state.ask
            ? el('div', { key: 'ask', className: 'col' }, [
                el('p', { key: 'q' }, t('follow.clearAsk')),
                el(
                  'div',
                  { key: 'b', className: 'row', style: { flexWrap: 'wrap' } },
                  [
                    button('confirmClear', () => state.perform('clear')),
                    button('cancel', () => state.setAsk(false)),
                  ]
                ),
              ])
            : null,
          state.busy
            ? el('p', { key: 'b', role: 'status' }, t('follow.working'))
            : null,
          el(Notice, { key: 'n', notice: state.notice, t }),
          data
            ? el(
                'div',
                { key: 'r', className: 'col', 'data-follow-results': true },
                [
                  el(
                    'p',
                    { key: 't' },
                    t('follow.total', { count: data.total })
                  ),
                  ...data.links.map((link) =>
                    el(Reference, { key: link.id, link, t })
                  ),
                  el(
                    'div',
                    { key: 'p', className: 'row', style: { flexWrap: 'wrap' } },
                    [
                      button(
                        'previous',
                        () =>
                          state.perform('load', Math.max(0, data.offset - 25)),
                        !data.offset
                      ),
                      button(
                        'next',
                        () => state.perform('load', data.offset + 25),
                        !data.more
                      ),
                    ]
                  ),
                ]
              )
            : null,
        ]
      ),
    ]
  );
};
