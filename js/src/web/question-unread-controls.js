import React from 'react';
import { useT } from './i18n.js';
import { browserUnreadId } from '../automation/question-unread-state.js';
import { unreadSkipTarget } from '../automation/question-unread-polling-state.js';
import { browserWatchPhaseKey } from './question-browser-watch-state.js';
import { ModelDraftControl } from './answer-model-settings.js';
import { UnreadFormOption, UnreadFormResult } from './question-unread-forms.js';
import {
  useUnreadPolling,
  UnreadPollingFields,
  UnreadPollingStatus,
} from './question-unread-polling.js';

const el = React.createElement;
const activePass = (result) => result?.owned && result.state === 'active';
const validLimit = (value, polling) =>
  Number.isInteger(value) && value >= 1 && value <= 100 && polling.valid;

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
    if (!activePass(result) || busy) {
      return undefined;
    }
    let current = true;
    const timer = globalThis.setTimeout(async () => {
      try {
        const value = await api.browserUnreadReviewStatus({ id });
        if (current && !running.current) {
          setResult(value);
        }
      } catch (err) {
        if (current && !running.current) {
          setError(
            t('browserAnswer.error', { code: err.code ?? 'unconfirmed' })
          );
        }
      }
    }, 750);
    return () => {
      current = false;
      globalThis.clearTimeout(timer);
    };
  }, [api, busy, result, id, t]);
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
    skip: (target) => run(() => api.skipBrowserUnreadReview(target)),
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

const UnreadRestoration = ({
  restoration,
  watchWaiting,
  skip,
  skipDisabled,
}) => {
  const t = useT();
  if (!restoration) {
    return null;
  }
  if (restoration.heldReview) {
    const held = restoration.heldReview;
    return el(
      'div',
      { className: 'col', 'data-browser-unread-held': held.chat },
      [
        el(
          'p',
          { key: 'state', role: 'status' },
          t(watchWaiting ? 'browserUnread.heldWaiting' : 'browserUnread.held', {
            chat: held.chat,
          })
        ),
        held.title
          ? el('p', { key: 'title', className: 'wrap' }, held.title)
          : null,
        skip
          ? el(
              'button',
              {
                key: 'skip',
                type: 'button',
                disabled: skipDisabled,
                'data-browser-unread-skip': true,
                onClick: skip,
              },
              t('browserUnread.skip')
            )
          : null,
        held.url
          ? el(
              'a',
              {
                key: 'link',
                href: held.url,
                target: '_blank',
                rel: 'noopener noreferrer',
                className: 'wrap',
              },
              held.url
            )
          : null,
      ]
    );
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

const UnreadResult = ({ result, blocked, select, skip, skipDisabled }) => {
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
        !result.polling &&
          t(
            result.state === 'active' && result.reviewChoices
              ? 'browserUnread.activeReviewChoices'
              : `browserUnread.${result.state}${['active', 'paused'].includes(result.state) ? (result.answerChats ? 'Answers' : result.noticeReplies ? 'Notices' : '') : ''}`
          )
      ),
      el(UnreadPollingStatus, {
        key: 'polling',
        polling: result.polling,
        watchWaiting: result.watchWaiting,
      }),
      result.coverage
        ? el(
            'p',
            { key: 'coverage', className: 'meta' },
            t(
              result.watchWaiting
                ? 'browserUnread.waitingCoverage'
                : 'browserUnread.coverage',
              {
                visited: result.coverage.visited,
                observed: result.coverage.observed,
              }
            )
          )
        : null,
      el(UnreadRestoration, {
        key: 'restoration',
        restoration: result.restoration,
        watchWaiting: result.watchWaiting,
        skip,
        skipDisabled,
      }),
      result.polling?.lastSkip
        ? el(
            'p',
            {
              key: 'skipped',
              role: 'status',
              'data-browser-unread-skipped': true,
            },
            t('browserUnread.skipConfirmed', {
              chat: result.polling.lastSkip.chat,
            })
          )
        : null,
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
          entry.answer
            ? el(
                'p',
                {
                  key: 'answer',
                  role: 'status',
                  'data-browser-unread-answer': entry.answer.phase,
                },
                entry.answer.summaryAnswers
                  ? t(
                      entry.answer.phase === 'no-reply'
                        ? 'browserUnread.summary.saved'
                        : 'browserUnread.summary.learned',
                      { count: entry.answer.summaryAnswers }
                    )
                  : t(`browserUnread.answer.${entry.answer.phase}`)
              )
            : null,
          entry.answer?.historyAnswers
            ? el(
                'p',
                {
                  key: 'history-answers',
                  className: 'meta',
                  'data-browser-unread-history-answers': true,
                },
                t('browserUnread.historyAnswers.saved', {
                  count: entry.answer.historyAnswers,
                })
              )
            : null,
          [
            'question-unread-history-unverified',
            'question-unread-history-save-failed',
          ].includes(entry.answer?.reason)
            ? el(
                'p',
                { key: 'history-hold', className: 'meta' },
                t('browserUnread.historyAnswers.hold')
              )
            : null,
          [
            'question-unread-summary-unverified',
            'question-unread-summary-save-failed',
          ].includes(entry.answer?.reason)
            ? el(
                'p',
                { key: 'summary-hold', className: 'meta' },
                t('browserUnread.summary.hold')
              )
            : null,
          entry.answer?.selection
            ? el(
                'p',
                { key: 'option', className: 'wrap' },
                entry.answer.selection.option
              )
            : null,
          entry.answer?.outbox?.receipt?.messageId
            ? el(
                'small',
                { key: 'receipt', className: 'meta' },
                t('browserAnswer.receipt', {
                  id: entry.answer.outbox.receipt.messageId,
                })
              )
            : null,
          entry.preview
            ? el('p', { key: 'preview', className: 'wrap' }, entry.preview)
            : null,
          el(UnreadNoticeResult, { key: 'notice', notice: entry.notice }),
          el(UnreadFormResult, { key: 'form', form: entry.form }),
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
  answersAvailable,
  formsAvailable,
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
  const [answerChats, setAnswerChats] = React.useState(false);
  const [reviewChoices, setReviewChoices] = React.useState(false);
  const [autoReuseAnswers, setAutoReuseAnswers] = React.useState(false);
  const [modelDraft, setModelDraft] = React.useState(false);
  const [prefillForms, setPrefillForms] = React.useState(false);
  const [watchWaiting, setWatchWaiting] = React.useState(false);
  const canPrefillForms = answerChats && answersAvailable && formsAvailable;
  const canReuseAnswers = source === 'hh' && answerChats && answersAvailable;
  const polling = useUnreadPolling();
  const canWatchWaiting =
    source === 'hh' &&
    answerChats &&
    answersAvailable &&
    reviewChoices &&
    polling.enabled;
  const watching = canWatchWaiting && watchWaiting;
  const skipTarget =
    api.skipBrowserUnreadReview && unreadSkipTarget(pass.result);
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
        t(
          `browserUnread.${watching || pass.result?.watchWaiting ? 'waitingHint' : answerChats ? 'answersHint' : noticeReplies ? 'noticesHint' : 'hint'}`
        )
      ),
      noticesAvailable
        ? el('label', { key: 'notices', className: 'check' }, [
            el('input', {
              key: 'input',
              type: 'checkbox',
              checked: noticeReplies,
              disabled: locked,
              'data-browser-unread-notices': true,
              onChange: (event) => {
                setNoticeReplies(event.target.checked);
                if (event.target.checked) {
                  setAnswerChats(false);
                }
              },
            }),
            t('browserUnread.notices'),
          ])
        : null,
      answersAvailable
        ? el('label', { key: 'answers', className: 'check' }, [
            el('input', {
              key: 'input',
              type: 'checkbox',
              checked: answerChats,
              disabled: locked,
              'data-browser-unread-answers': true,
              onChange: (event) => {
                setAnswerChats(event.target.checked);
                if (event.target.checked) {
                  setNoticeReplies(false);
                }
              },
            }),
            t('browserUnread.answers'),
          ])
        : null,
      answerChats && answersAvailable
        ? el('label', { key: 'review-choices', className: 'check' }, [
            el('input', {
              key: 'input',
              type: 'checkbox',
              checked: reviewChoices,
              disabled: locked,
              'data-browser-unread-review-choices': true,
              onChange: (event) => setReviewChoices(event.target.checked),
            }),
            t(
              canReuseAnswers && autoReuseAnswers
                ? 'browserUnread.reviewOtherChoices'
                : 'browserUnread.reviewChoices'
            ),
          ])
        : null,
      canReuseAnswers
        ? el('label', { key: 'auto-reuse', className: 'check' }, [
            el('input', {
              key: 'input',
              type: 'checkbox',
              checked: autoReuseAnswers,
              disabled: locked,
              'data-browser-unread-auto-reuse': true,
              onChange: (event) => setAutoReuseAnswers(event.target.checked),
            }),
            t('application.autoReuseAnswers'),
          ])
        : null,
      answerChats && answersAvailable
        ? el(ModelDraftControl, {
            key: 'model',
            value: modelDraft,
            set: setModelDraft,
            busy: locked,
          })
        : null,
      canPrefillForms
        ? el(UnreadFormOption, {
            key: 'forms',
            value: prefillForms,
            set: setPrefillForms,
            disabled: locked,
          })
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
      el(UnreadPollingFields, { key: 'polling', polling, disabled: locked }),
      canWatchWaiting
        ? el('label', { key: 'watch-waiting', className: 'check' }, [
            el('input', {
              key: 'input',
              type: 'checkbox',
              checked: watchWaiting,
              disabled: locked,
              'data-browser-unread-watch-waiting': true,
              onChange: (event) => setWatchWaiting(event.target.checked),
            }),
            t('browserUnread.watchWaiting'),
          ])
        : null,
      el(
        'button',
        {
          key: 'start',
          type: 'button',
          'data-browser-unread-start': true,
          disabled: locked || !confirm || !validLimit(maxChats, polling),
          onClick: () =>
            pass.start({
              ...planning,
              modelDraft: answerChats && answersAvailable && modelDraft,
              source,
              confirm: true,
              maxChats,
              ...polling.input,
              ...(watching ? { watchWaiting: true } : {}),
              ...(noticeReplies && noticesAvailable
                ? { noticeReplies: true }
                : {}),
              ...(answerChats && answersAvailable ? { answerChats: true } : {}),
              ...(answerChats && answersAvailable && reviewChoices
                ? { reviewChoices: true }
                : {}),
              ...(canReuseAnswers && autoReuseAnswers
                ? { autoReuseAnswers: true }
                : {}),
              ...(canPrefillForms && prefillForms
                ? { prefillForms: true }
                : {}),
            }),
        },
        t(
          `browserUnread.${watching ? 'startWaiting' : answerChats && answersAvailable ? 'startAnswers' : noticeReplies && noticesAvailable ? 'startNotices' : 'start'}`
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
        skip: skipTarget ? () => pass.skip(skipTarget) : undefined,
        skipDisabled: pass.busy,
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
