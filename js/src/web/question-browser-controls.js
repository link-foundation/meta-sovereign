import React from 'react';
import { AnswerEvidence } from './question-evidence.js';
import { useT } from './i18n.js';
import { getLocalStorage } from '../storage/local-storage.js';
import { BrowserAnswerWatchControls } from './question-browser-watch-controls.js';

const el = React.createElement;
const remember = (key, id) => {
  try {
    const storage = getLocalStorage();
    if (id) {
      storage?.setItem(key, id);
    } else if (id === null) {
      storage?.removeItem(key);
    }
    return storage?.getItem(key) ?? '';
  } catch {
    return '';
  }
};
const Field = ({ label, value, change, ...props }) =>
  el('label', { className: 'field' }, [
    el('span', { key: 'label', className: 'field-label' }, label),
    el('input', {
      key: 'input',
      value,
      onChange: (event) => change(event.target.value),
      ...props,
    }),
  ]);

const BrowserAnswerAction = ({
  result,
  option,
  setOption,
  blocked,
  select,
  run,
  api,
  receive,
}) => {
  const t = useT();
  return result.strictOptions
    ? el('fieldset', { className: 'col', disabled: blocked }, [
        el('legend', { key: 'legend' }, t('browserAnswer.options')),
        ...result.answerOptions.map((label, index) =>
          el('label', { key: index, className: 'check' }, [
            el('input', {
              key: 'input',
              type: 'radio',
              name: result.id,
              value: label,
              checked: option === label,
              onChange: () => setOption(label),
              disabled:
                result.answerOptions.filter((value) => value === label)
                  .length !== 1,
            }),
            label,
          ])
        ),
        !result.answerOptions.length
          ? el(
              'p',
              { key: 'pending', className: 'meta' },
              t('browserAnswer.pending')
            )
          : null,
        el(
          'button',
          {
            key: 'send',
            type: 'button',
            className: 'primary',
            disabled: blocked || !option || result.hasDraft,
            'data-browser-answer-select': true,
            onClick: () => select({ id: result.id, option, confirm: true }),
          },
          t('browserAnswer.select', { option: option || '…' })
        ),
      ])
    : el(
        'button',
        {
          type: 'button',
          disabled:
            blocked ||
            !result.plan?.complete ||
            !result.plan?.text ||
            result.hasDraft ||
            result.prefilled,
          onClick: () =>
            run(async () =>
              receive(await api.prefillBrowserAnswer({ id: result.id }))
            ),
        },
        t(
          result.prefilled ? 'browserAnswer.prefilled' : 'browserAnswer.prefill'
        )
      );
};

const BrowserAnswerTarget = ({
  caps,
  busy,
  source,
  setSource,
  reference,
  setReference,
  browserUrl,
  setBrowserUrl,
  change,
  inspect,
}) => {
  const t = useT();
  return caps?.available
    ? el('fieldset', { className: 'col', disabled: busy }, [
        el('label', { key: 'source', className: 'field' }, [
          el(
            'span',
            { key: 'label', className: 'field-label' },
            t('browserAnswer.source')
          ),
          el(
            'select',
            {
              key: 'select',
              value: source,
              'aria-label': t('browserAnswer.source'),
              onChange: (event) => change(setSource)(event.target.value),
            },
            caps.sources.map((entry) =>
              el('option', { key: entry.id, value: entry.id }, entry.name)
            )
          ),
        ]),
        el(Field, {
          key: 'chat',
          label: t('browserAnswer.chat'),
          value: reference,
          change: change(setReference),
          maxLength: 480,
        }),
        el(Field, {
          key: 'url',
          label: t('browserAnswer.url'),
          value: browserUrl,
          change: change(setBrowserUrl),
          maxLength: 4096,
        }),
        el(
          'button',
          {
            key: 'inspect',
            type: 'button',
            disabled: !reference.trim(),
            'data-browser-answer-inspect': true,
            onClick: inspect,
          },
          t('browserAnswer.inspect')
        ),
      ])
    : caps
      ? el('p', { className: 'meta' }, t('browserAnswer.unavailable'))
      : null;
};

const reviewBlocked = (result, busy, pending) =>
  busy ||
  pending ||
  result.expired ||
  result.question.outgoing ||
  ['sending', 'sent', 'unknown'].includes(result.status);

const BrowserAnswerReview = ({
  result,
  option,
  setOption,
  busy,
  pending,
  select,
  run,
  api,
  receive,
}) => {
  const t = useT();
  if (!result) {
    return null;
  }
  const blocked = reviewBlocked(result, busy, pending);
  return el(
    'div',
    { className: 'col', 'data-browser-answer-review': result.id },
    [
      el(
        'small',
        { key: 'target', className: 'meta' },
        `${result.target.source} · ${result.chat}`
      ),
      el('p', { key: 'question', className: 'wrap' }, result.question.body),
      el(
        'p',
        {
          key: 'status',
          role: 'status',
          'data-browser-answer-status': result.status,
        },
        t(
          `browserAnswer.${result.outbox?.resolvedBy === 'user' && result.status === 'sent' ? 'markedSent' : result.status}`
        )
      ),
      result.outbox?.receipt
        ? el(
            'small',
            { key: 'receipt', className: 'meta' },
            t('browserAnswer.receipt', { id: result.outbox.receipt.messageId })
          )
        : null,
      pending
        ? el(
            'p',
            { key: 'pendingResponse', role: 'status' },
            t('browserAnswer.unconfirmed')
          )
        : null,
      result.question.outgoing
        ? el(
            'p',
            { key: 'outgoing', className: 'meta' },
            t('browserAnswer.outgoing')
          )
        : null,
      result.hasDraft
        ? el(
            'p',
            { key: 'owner', className: 'meta' },
            t('browserAnswer.ownerDraft')
          )
        : null,
      result.expired
        ? el(
            'p',
            { key: 'expired', className: 'meta' },
            t('browserAnswer.expired')
          )
        : null,
      result.plan
        ? el(
            'pre',
            {
              key: 'plan',
              className: 'wrap',
              style: { whiteSpace: 'pre-wrap' },
            },
            result.plan.text || t('questions.noAnswer')
          )
        : null,
      el(AnswerEvidence, { key: 'evidence', answer: result.plan }),
      el(BrowserAnswerAction, {
        key: 'action',
        result,
        option,
        setOption,
        blocked,
        select,
        run,
        api,
        receive,
      }),
      el(
        'button',
        {
          key: 'statusButton',
          type: 'button',
          disabled: busy,
          onClick: () =>
            run(async () =>
              receive(await api.browserAnswerStatus({ id: result.id }))
            ),
        },
        t('browserAnswer.recover')
      ),
    ]
  );
};

const browserAnswerDefaults = (chat) => ({
  source: chat?.source ?? 'hh',
  reference: String(chat?.chat ?? ''),
  key: `metaSovereign.browserAnswer.${chat?.key ?? 'settings'}`,
});

const watchAvailable = (caps, source) =>
  caps?.watchSources?.some((entry) => entry.id === source);

const loadBrowserAnswer = async (api, key, receive, target) => {
  const value = await api.browserAnswerCapabilities();
  target.caps(value);
  if (
    value.available &&
    !value.sources.some((entry) => entry.id === target.current)
  ) {
    target.source(value.sources[0].id);
  }
  if (value.available) {
    await restoreBrowserAnswer(api, key, receive, target);
  }
};

const restoreBrowserAnswer = async (api, key, receive, target) => {
  const id = remember(key);
  if (id) {
    const restored = await api.browserAnswerStatus({ id });
    receive(restored);
    target.source(restored.target.source);
    target.chat(restored.target.chat);
    target.url(restored.target.browserUrl ?? '');
  }
};

/** Shared by Chat, Operator and question settings; no action on initial render. */
export const BrowserAnswerControls = ({ api, chat, planning = {} }) => {
  const t = useT();
  const [caps, setCaps] = React.useState(null);
  const initial = browserAnswerDefaults(chat);
  const [source, setSource] = React.useState(initial.source);
  const [reference, setReference] = React.useState(initial.reference);
  const [browserUrl, setBrowserUrl] = React.useState('');
  const [result, setResult] = React.useState(null);
  const [option, setOption] = React.useState('');
  const [pending, setPending] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [watchActive, setWatchActive] = React.useState(false);
  const active = React.useRef(false);
  const key = initial.key;
  const receive = (value) => {
    setResult(value);
    setPending(false);
    remember(key, value.id);
    setOption((before) =>
      value.answerOptions.includes(before) ? before : (value.plan?.option ?? '')
    );
  };
  const run = async (work) => {
    if (active.current) {
      return;
    }
    active.current = true;
    setBusy(true);
    setError('');
    try {
      await work();
    } catch (err) {
      setError(t('browserAnswer.error', { code: err.code ?? 'unconfirmed' }));
    } finally {
      active.current = false;
      setBusy(false);
    }
  };
  const select = (input) =>
    run(async () => {
      setPending(true);
      receive(await api.selectBrowserAnswer(input));
    });
  const load = () =>
    loadBrowserAnswer(api, key, receive, {
      current: source,
      caps: setCaps,
      source: setSource,
      chat: setReference,
      url: setBrowserUrl,
    });
  const change = (set) => (value) => {
    set(value);
    setResult(null);
    setOption('');
    setPending(false);
  };
  if (!api?.browserAnswerCapabilities) {
    return null;
  }
  return el(
    'details',
    {
      className: 'card col browser-answer-controls',
      'data-browser-answer-controls': true,
      onToggle: (event) => {
        if (
          event.target === event.currentTarget &&
          event.currentTarget.open &&
          !caps
        ) {
          run(load);
        }
      },
    },
    [
      el('summary', { key: 'title' }, t('browserAnswer.title')),
      el('p', { key: 'hint', className: 'meta' }, t('browserAnswer.hint')),
      busy
        ? el('p', { key: 'busy', role: 'status' }, t('common.loading'))
        : null,
      error ? el('p', { key: 'error', role: 'alert' }, error) : null,
      el(BrowserAnswerTarget, {
        key: 'target',
        caps,
        busy: busy || watchActive,
        source,
        setSource,
        reference,
        setReference,
        browserUrl,
        setBrowserUrl,
        change,
        inspect: () =>
          run(async () => {
            const value = await api.inspectBrowserAnswer({
              ...planning,
              source,
              chat: reference,
              ...(browserUrl ? { browserUrl } : {}),
            });
            setOption('');
            receive(value);
          }),
      }),
      el(BrowserAnswerReview, {
        key: 'review',
        result,
        option,
        setOption,
        busy: busy || watchActive,
        pending,
        select,
        run,
        api,
        receive,
      }),
      el(BrowserAnswerWatchControls, {
        key: 'watch',
        api,
        review: result,
        available: watchAvailable(caps, result?.target.source ?? source),
        enabled: Boolean(caps),
        busy,
        run,
        remember,
        storageKey: `${key}.watch`,
        changed: setWatchActive,
      }),
      el(
        'button',
        {
          key: 'reload',
          type: 'button',
          disabled: busy,
          onClick: () => run(load),
        },
        t('browserAnswer.reload')
      ),
    ]
  );
};
