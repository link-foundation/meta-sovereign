import React from 'react';
import { useT } from './i18n.js';
import { browserUnreadId } from '../automation/question-unread-state.js';
import { browserWatchPhaseKey } from './question-browser-watch-state.js';

const el = React.createElement;
const activePass = (result) => result?.owned && result.state === 'active';
const validLimit = (value) =>
  Number.isInteger(value) && value >= 1 && value <= 100;

const useUnreadPass = ({
  api,
  remember,
  storageKey,
  legacyStorageKey,
  changed,
}) => {
  const t = useT();
  const [id, setId] = React.useState(() => {
    const saved = remember(storageKey);
    if (browserUnreadId(saved)) {
      return saved;
    }
    const legacy = remember(legacyStorageKey);
    return browserUnreadId(legacy) ? legacy : '';
  });
  const [result, setResult] = React.useState(null);
  const [pending, setPending] = React.useState(Boolean(id));
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const running = React.useRef(false);
  const run = async (work) => {
    if (running.current) {
      return;
    }
    running.current = true;
    setBusy(true);
    setError('');
    try {
      const value = await work();
      if (value) {
        remember(storageKey, value.id);
        setResult(value);
        setPending(false);
      }
    } catch (err) {
      setError(t('browserAnswer.error', { code: err.code ?? 'unconfirmed' }));
      if (err.code === 'question-unread-missing') {
        remember(storageKey, null);
        if (remember(legacyStorageKey) === id) {
          remember(legacyStorageKey, null);
        }
        setId('');
        setPending(false);
      }
    } finally {
      running.current = false;
      setBusy(false);
    }
  };
  React.useEffect(() => {
    changed(pending || activePass(result) || busy);
  }, [pending, result, busy, changed]);
  React.useEffect(() => () => changed(false), [changed]);
  React.useEffect(() => {
    if (!activePass(result)) {
      return undefined;
    }
    const timer = globalThis.setTimeout(() => {
      run(() => api.browserUnreadReviewStatus({ id }));
    }, 750);
    return () => globalThis.clearTimeout(timer);
  }, [result, id]);
  return {
    id,
    result,
    pending,
    busy,
    error,
    run,
    async start(input) {
      if (running.current) {
        return;
      }
      const next = `question-unread:${globalThis.crypto.randomUUID()}`;
      remember(storageKey, next);
      setId(next);
      setResult(null);
      setPending(true);
      await run(() => api.startBrowserUnreadReview({ ...input, id: next }));
    },
    recover: () => run(() => api.browserUnreadReviewStatus({ id })),
    stop: () => run(() => api.stopBrowserUnreadReview({ id })),
  };
};

const UnreadNoticeResult = ({ notice }) => {
  const t = useT();
  return notice
    ? el(
        'div',
        { className: 'col', 'data-browser-unread-notice': notice.phase },
        [
          el(
            'p',
            {
              key: 'phase',
              role: ['unknown', 'failed'].includes(notice.phase)
                ? 'alert'
                : 'status',
            },
            t(browserWatchPhaseKey({ ...notice, noticeReplies: true }))
          ),
          notice.selection?.text
            ? el('p', { key: 'text', className: 'wrap' }, notice.selection.text)
            : null,
          notice.outbox?.receipt?.messageId
            ? el(
                'small',
                { key: 'receipt', className: 'meta' },
                t('browserAnswer.receipt', {
                  id: notice.outbox.receipt.messageId,
                })
              )
            : null,
        ]
      )
    : null;
};

const UnreadRestoration = ({ restoration }) => {
  const t = useT();
  if (!restoration) {
    return null;
  }
  const revealed = restoration.replyView?.state === 'revealed';
  const key = restoration.restored
    ? revealed
      ? 'restoredReply'
      : 'restored'
    : 'notRestored';
  return el(React.Fragment, null, [
    el(
      'p',
      {
        key: 'restored',
        role: restoration.restored ? 'status' : 'alert',
      },
      t(`browserUnread.${key}`, { id: restoration.replyView?.messageId })
    ),
    restoration.replyView && !revealed
      ? el(
          'p',
          { key: 'reply-view', className: 'meta' },
          t('browserUnread.replyNotRevealed', {
            id: restoration.replyView.messageId,
          })
        )
      : null,
  ]);
};

const UnreadResult = ({ result, blocked, select }) => {
  const t = useT();
  if (!result) {
    return null;
  }
  return el(
    'div',
    { className: 'col', 'data-browser-unread-result': result.state },
    [
      el(
        'p',
        { key: 'state', role: 'status' },
        t(
          `browserUnread.${result.state}${result.noticeReplies && ['active', 'paused'].includes(result.state) ? 'Notices' : ''}`
        )
      ),
      result.coverage
        ? el(
            'p',
            { key: 'coverage', className: 'meta' },
            t('browserUnread.coverage', {
              visited: result.coverage.visited,
              observed: result.coverage.observed,
            })
          )
        : null,
      el(UnreadRestoration, {
        key: 'restoration',
        restoration: result.restoration,
      }),
      result.restoration?.history
        ? el(
            'p',
            { key: 'history', className: 'meta' },
            t('browserUnread.history', {
              before: result.restoration.history.lengthBefore,
              after: result.restoration.history.lengthAfter,
            })
          )
        : null,
      result.code
        ? el(
            'small',
            { key: 'code', className: 'meta' },
            t('browserWatch.reason', { code: result.code })
          )
        : null,
      ...result.entries.map((entry) =>
        el('div', { key: entry.chat, className: 'col' }, [
          entry.preview
            ? el('p', { key: 'preview', className: 'wrap' }, entry.preview)
            : null,
          el(UnreadNoticeResult, { key: 'notice', notice: entry.notice }),
          entry.reviewId
            ? el(
                'button',
                {
                  key: 'review',
                  type: 'button',
                  disabled: blocked,
                  'data-browser-unread-review': entry.chat,
                  onClick: () => select(entry.reviewId),
                },
                t('browserUnread.review', { chat: entry.chat })
              )
            : el(
                'p',
                { key: 'unverified', className: 'meta' },
                t('browserUnread.unverified', { chat: entry.chat })
              ),
        ])
      ),
    ]
  );
};

const UnreadControls = ({
  api,
  source,
  planning,
  blocked,
  changed,
  remember,
  storageKey,
  legacyStorageKey,
  select,
  noticesAvailable,
}) => {
  const t = useT();
  const pass = useUnreadPass({
    api,
    remember,
    storageKey,
    legacyStorageKey,
    changed,
  });
  const [confirm, setConfirm] = React.useState(false);
  const [limit, setLimit] = React.useState('20');
  const [noticeReplies, setNoticeReplies] = React.useState(false);
  const active = activePass(pass.result);
  const locked = blocked || pass.busy || pass.pending || active;
  const maxChats = Number(limit);
  return el(
    'section',
    { className: 'col', 'data-browser-unread-controls': true },
    [
      el('h4', { key: 'title' }, t('browserUnread.title')),
      el(
        'p',
        { key: 'hint', className: 'meta' },
        t(`browserUnread.${noticeReplies ? 'noticesHint' : 'hint'}`)
      ),
      noticesAvailable
        ? el('label', { key: 'notices', className: 'check' }, [
            el('input', {
              key: 'input',
              type: 'checkbox',
              checked: noticeReplies,
              disabled: locked,
              'data-browser-unread-notices': true,
              onChange: (event) => setNoticeReplies(event.target.checked),
            }),
            t('browserUnread.notices'),
          ])
        : null,
      el('label', { key: 'limit', className: 'field' }, [
        el(
          'span',
          { key: 'label', className: 'field-label' },
          t('browserUnread.limit')
        ),
        el('input', {
          key: 'input',
          type: 'number',
          min: 1,
          max: 100,
          value: limit,
          disabled: locked,
          onChange: (event) => setLimit(event.target.value),
        }),
      ]),
      el('label', { key: 'confirm', className: 'check' }, [
        el('input', {
          key: 'input',
          type: 'checkbox',
          checked: confirm,
          'data-browser-unread-confirm': true,
          disabled: locked,
          onChange: (event) => setConfirm(event.target.checked),
        }),
        t('browserUnread.confirm'),
      ]),
      el(
        'button',
        {
          key: 'start',
          type: 'button',
          'data-browser-unread-start': true,
          disabled: locked || !confirm || !validLimit(maxChats),
          onClick: () =>
            pass.start({
              ...planning,
              source,
              confirm: true,
              maxChats,
              ...(noticeReplies && noticesAvailable
                ? { noticeReplies: true }
                : {}),
            }),
        },
        t(
          `browserUnread.${noticeReplies && noticesAvailable ? 'startNotices' : 'start'}`
        )
      ),
      pass.pending
        ? el(
            'p',
            { key: 'pending', role: 'status' },
            t('browserUnread.unconfirmed')
          )
        : null,
      pass.error ? el('p', { key: 'error', role: 'alert' }, pass.error) : null,
      pass.id
        ? el('div', { key: 'recovery', className: 'row wrap' }, [
            el(
              'button',
              {
                key: 'recover',
                type: 'button',
                disabled: pass.busy,
                onClick: pass.recover,
              },
              t('browserUnread.recover')
            ),
            active || pass.pending
              ? el(
                  'button',
                  {
                    key: 'stop',
                    type: 'button',
                    disabled: pass.busy,
                    onClick: pass.stop,
                  },
                  t('browserUnread.stop')
                )
              : null,
          ])
        : null,
      el(UnreadResult, {
        key: 'result',
        result: pass.result,
        blocked: locked,
        select: (id) =>
          pass.run(async () => {
            await select(id);
          }),
      }),
    ]
  );
};

export const BrowserUnreadControls = (props) =>
  props.available && props.api?.startBrowserUnreadReview
    ? el(UnreadControls, { ...props, key: props.source })
    : null;
