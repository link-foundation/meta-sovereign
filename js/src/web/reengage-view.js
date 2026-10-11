// Re-engage view (issue #31, R-W7).
//
// Every personal contact silent for at least 90 days, one at a time:
// who it is, how long the silence is, whether the dialog was on "ты"
// or "вы" (and why the detector thinks so), and the message that would
// go out. Safe mode is on by default — the only way to send is one
// "Send" click per message. Turning it off reveals "Send all", which
// still asks before it sends anything.
//
// The plan and every decision work offline from the links this browser
// holds (`api.reengagePlan`, `api.reengageRecord` prefer the server when
// one is up); only sending through an adapter needs the local server. The `api` is injected (defaulting
// to ./dom.js) so the screen renders in tests without a browser.

import React, { useCallback, useEffect, useState } from 'react';
import { api as defaultApi } from './dom.js';
import { useT } from './i18n.js';
import {
  DEFAULT_DORMANT_DAYS,
  createReengageSession,
} from '../crm/reengage.js';

const el = React.createElement;

const EMPTY_COUNTS = { position: 0, sent: 0, skipped: 0, failed: 0 };

/**
 * Sender for the session: the server answers `{status, error}`; any
 * answer other than "sent" becomes a thrown error so the session keeps
 * the draft current and records it as failed.
 */
export const serverSender = (api) => async (draft) => {
  const answer = await api.reengageSend(draft);
  if (answer?.status !== 'sent') {
    throw new Error(answer?.error ?? 'not sent');
  }
  return answer.record?.result ?? null;
};

/**
 * Progress across the sessions of one plan. Switching safe mode off
 * hands the remaining drafts to a new (batch) session, so the counts of
 * the finished one are carried in `base`.
 */
export const combinedProgress = (base, progress) => ({
  total: base.position + progress.total,
  position: base.position + progress.position,
  remaining: progress.remaining,
  done: progress.done,
  sent: base.sent + progress.sent,
  skipped: base.skipped + progress.skipped,
  failed: base.failed + progress.failed,
});

const outcomeNotice = (outcome) => ({
  status: outcome.status,
  manual: Boolean(outcome.record?.manual),
  error: outcome.error ?? null,
});

const defaultConfirm = (message) =>
  typeof globalThis.confirm === 'function'
    ? globalThis.confirm(message)
    : false;

const defaultCopy = (text) =>
  globalThis.navigator?.clipboard?.writeText?.(text) ?? Promise.resolve();

export const useReengageState = (
  api,
  { confirmAll = defaultConfirm, copyText = defaultCopy } = {}
) => {
  const t = useT();
  const [days, setDays] = useState(DEFAULT_DORMANT_DAYS);
  const [plan, setPlan] = useState(null);
  const [session, setSession] = useState(null);
  const [base, setBase] = useState(EMPTY_COUNTS);
  const [safe, setSafeState] = useState(true);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState(null);
  const [, setTick] = useState(0);
  const refresh = () => setTick((n) => n + 1);

  const newSession = useCallback(
    (drafts, mode) =>
      createReengageSession({
        drafts,
        mode,
        send: serverSender(api),
        record: (link) => api.reengageRecord(link),
      }),
    [api]
  );

  const run = useCallback(async (name, fn) => {
    setBusy(name);
    try {
      return await fn();
    } catch (error) {
      setNotice({ status: 'failed', error: error?.message ?? String(error) });
      return null;
    } finally {
      setBusy('');
    }
  }, []);

  const find = useCallback(
    (threshold) =>
      run('plan', async () => {
        const next = await api.reengagePlan({ days: threshold });
        setPlan(next);
        setBase(EMPTY_COUNTS);
        setNotice(null);
        setSession(newSession(next.drafts, safe ? 'safe' : 'batch'));
      }),
    [api, run, newSession, safe]
  );

  // Plan once per api; later plans come from the "Find" button.
  useEffect(() => {
    find(DEFAULT_DORMANT_DAYS);
  }, [api]);

  const act = useCallback(
    (name, step) =>
      run(name, async () => {
        setNotice(outcomeNotice(await step(session)));
        refresh();
      }),
    [run, session]
  );

  const setSafe = useCallback(
    (on) => {
      if (session) {
        const progress = session.progress();
        setBase((b) => combinedProgress(b, progress));
        setSession(newSession(session.pending(), on ? 'safe' : 'batch'));
      }
      setSafeState(on);
    },
    [session, newSession]
  );

  const sendAll = useCallback(() => {
    const left = session?.progress().remaining ?? 0;
    if (safe || left === 0 || !confirmAll(t('reengage.confirmAll', { left }))) {
      return null;
    }
    return run('send-all', async () => {
      const results = await session.sendAll();
      const failed = results.filter((r) => r.status === 'failed');
      setNotice(
        failed.length
          ? { status: 'failed', error: failed.map((r) => r.error).join('; ') }
          : { status: 'sent', manual: false, error: null }
      );
      refresh();
    });
  }, [session, safe, confirmAll, run, t]);

  const current = session?.current() ?? null;
  return {
    days,
    plan,
    current,
    progress: session
      ? combinedProgress(base, session.progress())
      : { ...EMPTY_COUNTS, total: 0, remaining: 0, done: true },
    safe,
    busy,
    notice,
    setDays,
    find: () => find(Number(days) || DEFAULT_DORMANT_DAYS),
    setSafe,
    edit: (text) => {
      session.edit(text);
      refresh();
    },
    switchForm: () => {
      session.setForm(current.form === 'formal' ? 'informal' : 'formal');
      refresh();
    },
    send: () => act('send', (s) => s.confirm()),
    markSent: () => act('mark', (s) => s.markSent()),
    skip: () => act('skip', (s) => s.skip()),
    copy: () =>
      run('copy', async () => {
        await copyText(current.text);
        setNotice({ status: 'copied' });
      }),
    sendAll,
  };
};

const button = (id, label, { disabled, onClick, className }) =>
  el(
    'button',
    {
      key: id,
      type: 'button',
      className,
      'data-action': `reengage-${id}`,
      disabled,
      onClick,
    },
    label
  );

const Controls = ({ state }) => {
  const t = useT();
  const idle = state.busy === '';
  return el('div', { className: 'row reengage-controls' }, [
    el('label', { key: 'days' }, [
      t('reengage.days'),
      ' ',
      el('input', {
        key: 'input',
        type: 'number',
        min: 1,
        value: state.days,
        'aria-label': t('reengage.days'),
        onChange: (event) => state.setDays(event.target.value),
      }),
    ]),
    button('find', t('reengage.find'), {
      disabled: !idle,
      onClick: state.find,
    }),
    el(
      'label',
      { key: 'safe', className: 'row', 'data-safe-mode': String(state.safe) },
      [
        el('input', {
          key: 'box',
          type: 'checkbox',
          // `input { width: 100% }` in app.css would push the label
          // below the box.
          style: { width: 'auto' },
          checked: state.safe,
          onChange: (event) => state.setSafe(event.target.checked),
        }),
        el('span', { key: 'text' }, t('reengage.safeMode')),
      ]
    ),
    state.safe
      ? null
      : button(
          'send-all',
          t('reengage.sendAll', { left: state.progress.remaining }),
          {
            className: 'danger',
            disabled: !idle || state.progress.remaining === 0,
            onClick: state.sendAll,
          }
        ),
  ]);
};

const FORM_KEYS = { informal: 'reengage.informal', formal: 'reengage.formal' };

const Evidence = ({ addressForm }) => {
  const t = useT();
  const rules = Object.entries(addressForm?.rules ?? {})
    .map(([rule, count]) => `${rule}×${count}`)
    .join(', ');
  const reason = t(`reengage.reason.${addressForm?.reason ?? 'no-evidence'}`, {
    percent: Math.round((addressForm?.confidence ?? 0) * 100),
  });
  return el(
    'p',
    { className: 'meta', 'data-form-reason': addressForm?.reason },
    rules ? `${reason}: ${rules}` : reason
  );
};

const DraftCard = ({ state }) => {
  const t = useT();
  const draft = state.current;
  const idle = state.busy === '';
  const other = draft.form === 'formal' ? 'informal' : 'formal';
  return el(
    'div',
    {
      className: 'card reengage-draft',
      'data-draft': draft.id,
      'data-form': draft.form,
    },
    [
      el(
        'h3',
        { key: 'who' },
        t('reengage.position', {
          position: state.progress.position + 1,
          total: state.progress.total,
          name: draft.name ?? draft.contact,
          network: draft.source,
        })
      ),
      el(
        'p',
        { key: 'silence', className: 'meta' },
        t('reengage.silence', {
          days: draft.daysSilent,
          messages: draft.messageCount,
        })
      ),
      el(
        'p',
        { key: 'form' },
        t('reengage.detected', { form: t(FORM_KEYS[draft.form]) })
      ),
      el(Evidence, { key: 'evidence', addressForm: draft.addressForm }),
      el('textarea', {
        key: 'text',
        rows: 5,
        value: draft.text,
        'aria-label': t('reengage.text'),
        onChange: (event) => state.edit(event.target.value),
      }),
      el('div', { key: 'actions', className: 'row' }, [
        button('send', t('reengage.send'), {
          className: 'primary',
          disabled: !idle || draft.text.trim() === '',
          onClick: state.send,
        }),
        button('copy', t('reengage.copy'), {
          disabled: !idle,
          onClick: state.copy,
        }),
        draft.prefill
          ? el(
              'a',
              {
                key: 'open',
                href: draft.prefill.url,
                target: '_blank',
                rel: 'noopener noreferrer',
                'data-action': 'reengage-open',
              },
              t(
                draft.prefill.prefillsText
                  ? 'reengage.openFilled'
                  : 'reengage.open'
              )
            )
          : null,
        button(
          'switch-form',
          t('reengage.switchTo', { form: t(FORM_KEYS[other]) }),
          {
            disabled: !idle,
            onClick: state.switchForm,
          }
        ),
        button('mark-sent', t('reengage.markSent'), {
          disabled: !idle,
          onClick: state.markSent,
        }),
        button('skip', t('reengage.skip'), {
          disabled: !idle,
          onClick: state.skip,
        }),
      ]),
    ]
  );
};

const NOTICE_KEYS = {
  sent: 'reengage.notice.sent',
  manual: 'reengage.notice.manual',
  skipped: 'reengage.notice.skipped',
  copied: 'reengage.notice.copied',
  failed: 'reengage.notice.failed',
};

const Notice = ({ notice }) => {
  const t = useT();
  if (!notice) {
    return null;
  }
  const kind = notice.manual ? 'manual' : notice.status;
  return el(
    'p',
    {
      className: 'meta',
      role: kind === 'failed' ? 'alert' : 'status',
      'data-notice': kind,
    },
    t(NOTICE_KEYS[kind] ?? 'reengage.notice.failed', {
      error: notice.error ?? '',
    })
  );
};

const Body = ({ state }) => {
  const t = useT();
  if (!state.plan) {
    return el('p', { className: 'meta' }, t('common.loading'));
  }
  if (state.current) {
    return el(DraftCard, { state });
  }
  return el(
    'p',
    { className: 'meta', 'data-reengage': state.plan.total ? 'done' : 'empty' },
    state.plan.total
      ? t('reengage.done')
      : t('reengage.empty', { days: state.plan.days })
  );
};

/**
 * The screen itself, pure: everything it shows comes from `state`.
 * Rendering it directly (see `js/tests/reengage-web.test.js`) covers
 * the whole surface without a browser or a server.
 */
export const ReengageScreen = ({ state }) => {
  const t = useT();
  const p = state.progress;
  return el('div', { className: 'col reengage-view' }, [
    el('h2', { key: 'h' }, t('reengage.title')),
    el('p', { key: 'intro', className: 'meta' }, t('reengage.intro')),
    el(Controls, { key: 'controls', state }),
    state.plan
      ? el(
          'p',
          { key: 'summary', 'data-total': state.plan.total },
          t('reengage.summary', {
            total: state.plan.total,
            days: state.plan.days,
            excluded: state.plan.excluded.length,
          })
        )
      : null,
    el(Notice, { key: 'notice', notice: state.notice }),
    el(Body, { key: 'body', state }),
    el(
      'p',
      { key: 'progress', className: 'meta', 'data-progress': p.position },
      t('reengage.progress', {
        sent: p.sent,
        skipped: p.skipped,
        failed: p.failed,
        left: p.remaining,
      })
    ),
  ]);
};

export const ReengageView = ({ api = defaultApi, ...options }) =>
  el(ReengageScreen, { state: useReengageState(api, options) });
