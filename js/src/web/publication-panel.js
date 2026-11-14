import React, { useEffect, useRef, useState } from 'react';
import { useT } from './i18n.js';
import { createRetryingRead } from './read-retry.js';
import { PageLoading } from './spinner.js';
import { PublicationSettings } from './publication-settings.js';
import { PublicationHistory } from './publication-history.js';
import { action, toggle } from './publication-fields.js';
import {
  readPublicationDraft,
  savePublicationDraft,
  newPublicationDraft,
  matchesPublicationPreview,
  publicationRead,
  hasUncertainPublication,
} from './publication-state.js';
const h = React.createElement;

const usePublicationData = (api, revision, acceptHistory) => {
  const [data, setData] = useState(null);
  useEffect(() => {
    const read = createRetryingRead(
      async () => {
        const [targets, history] = await Promise.all([
          api.targets(),
          api.history(),
        ]);
        return {
          targets: publicationRead(targets).targets,
          history: publicationRead(history).history,
        };
      },
      {
        accept: (next) => {
          setData(next);
          acceptHistory(next.history);
        },
        failed: () => {},
      }
    );
    read.refresh();
    return read.stop;
  }, [api, revision, acceptHistory]);
  return data;
};
const Preview = ({ plan }) => {
  const t = useT();
  return h(
    'section',
    { className: 'publication-preview', 'data-publication-preview': true },
    [
      h('h4', { key: 'title' }, t('publication.review')),
      h('blockquote', { key: 'text' }, plan.text),
      h(
        'ul',
        { key: 'targets' },
        plan.targets.map((target, index) =>
          h(
            'li',
            { key: target.id },
            `${target.label} · ${target.destination || t('publication.authenticatedAccount')} · ${plan.capabilities[index].mode} · ${target.format} · ${t(plan.capabilities[index].configured && !plan.capabilities[index].readOnly ? 'publication.configured' : 'publication.notWritable')}`
          )
        )
      ),
      h('p', { key: 'permissions' }, t('publication.permissionHint')),
    ]
  );
};

const usePublicationPanel = (api) => {
  const t = useT();
  const [draft, setDraft] = useState(readPublicationDraft);
  const [plan, setPlan] = useState(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const [revision, refresh] = useState(0);
  const reload = () => refresh((n) => n + 1);
  const historyHandler = useRef(null);
  historyHandler.current = (history) =>
    setDraft((current) => {
      const record = history.find(
        (entry) => entry.requestId === current.pending?.requestId
      );
      if (!record || hasUncertainPublication(record)) {
        return current;
      }
      const next = { ...current, pending: null, completed: record.id };
      savePublicationDraft(next);
      return next;
    });
  const acceptHistory = useRef((history) =>
    historyHandler.current(history)
  ).current;
  const data = usePublicationData(api, revision, acceptHistory);
  useEffect(() => {
    if (!draft.pending) {
      return undefined;
    }
    const timer = globalThis.setInterval(reload, 5000);
    return () => globalThis.clearInterval(timer);
  }, [draft.pending]);
  const perform = async (run) => {
    if (locked.current) {
      return;
    }
    locked.current = true;
    setBusy(true);
    setNotice('');
    try {
      setNotice((await run()) ?? '');
    } catch (error) {
      setNotice(error.message);
    } finally {
      locked.current = false;
      setBusy(false);
    }
  };
  const edit = (patch) =>
    setDraft((before) => {
      const next = {
        ...before,
        ...patch,
        requestId: before.pending
          ? before.requestId
          : globalThis.crypto.randomUUID(),
        completed: null,
      };
      savePublicationDraft(next);
      setPlan(null);
      return next;
    });
  const body = () => ({
    text: draft.text,
    targetIds: draft.targetIds,
    requestId: draft.requestId,
    debug: draft.debug ?? false,
  });
  const preview = () =>
    perform(async () => {
      setPlan(publicationRead(await api.preview(body())));
    });
  const publish = () =>
    perform(async () => {
      const pending = body();
      if (!savePublicationDraft({ ...draft, pending })) {
        throw new Error(t('publication.storageRequired'));
      }
      setDraft((before) => ({ ...before, pending }));
      const answer = await api.publish(pending, ({ preview: next }) => {
        if (matchesPublicationPreview(plan, next)) {
          return true;
        }
        setPlan(next);
        return false;
      });
      const uncertain = hasUncertainPublication(answer);
      setDraft((before) => {
        const next = {
          ...before,
          pending: uncertain ? pending : null,
          completed: answer.id ?? null,
        };
        savePublicationDraft(next);
        return next;
      });
      if (answer.status !== 'cancelled') {
        setPlan(null);
      }
      reload();
      if (answer.error && !uncertain) {
        throw new Error(answer.error);
      }
      return answer.status === 'cancelled'
        ? t('publication.previewChanged')
        : t(
            uncertain
              ? 'publication.pendingHint'
              : `broadcast.${answer.status ?? 'failed'}`
          );
    });
  const reset = () => {
    if (
      draft.pending &&
      !globalThis.confirm(t('publication.newAfterUnknown'))
    ) {
      return;
    }
    const next = {
      ...newPublicationDraft(),
      text: draft.text,
      targetIds: draft.targetIds,
      debug: draft.debug ?? false,
    };
    setDraft(next);
    savePublicationDraft(next);
    setPlan(null);
    setNotice('');
  };
  return {
    draft,
    plan,
    notice,
    busy,
    data,
    edit,
    preview,
    publish,
    reset,
    reload,
    perform,
  };
};

export const PublicationPanel = ({ api }) => {
  const t = useT();
  const [tab, setTab] = useState('compose');
  const {
    draft,
    plan,
    notice,
    busy,
    data,
    edit,
    preview,
    publish,
    reset,
    reload,
    perform,
  } = usePublicationPanel(api);
  return h(
    'section',
    { className: 'publication-panel', 'data-publication-panel': true },
    [
      h('h3', { key: 'title' }, t('publication.title')),
      h('p', { key: 'hint' }, t('publication.hint')),
      h(
        'div',
        {
          key: 'tabs',
          className: 'row',
          role: 'tablist',
          'aria-label': t('publication.title'),
        },
        ['compose', 'destinations', 'history'].map((name) =>
          action(t(`publication.${name}`), () => setTab(name), busy, {
            key: name,
            role: 'tab',
            'aria-selected': tab === name,
          })
        )
      ),
      !data && h(PageLoading, { key: 'loading' }),
      notice &&
        h(
          'p',
          { key: 'notice', role: 'status', 'data-publication-notice': true },
          notice
        ),
      draft.pending &&
        h(
          'p',
          { key: 'pending', role: 'status' },
          t('publication.pendingHint')
        ),
      tab === 'destinations' &&
        data &&
        h(PublicationSettings, {
          key: 'settings',
          api,
          targets: data.targets,
          reload,
          perform,
          busy,
        }),
      tab === 'history' &&
        data &&
        h(PublicationHistory, {
          key: 'history',
          history: data.history,
          api,
          perform,
          reload,
          busy,
        }),
      tab === 'compose' &&
        data &&
        h(Compose, {
          key: 'compose',
          draft,
          edit,
          data,
          api,
          perform,
          busy,
          plan,
          preview,
          publish,
          reset,
          reload,
        }),
    ]
  );
};

const Compose = ({
  draft,
  edit,
  data,
  api,
  perform,
  busy,
  plan,
  preview,
  publish,
  reset,
  reload,
}) => {
  const t = useT();
  return h('div', { className: 'col' }, [
    h(
      'fieldset',
      { key: 'targets', disabled: busy, className: 'publication-targets' },
      [
        h('legend', { key: 'legend' }, t('publication.selectDestinations')),
        ...data.targets
          .filter((target) => target.enabled)
          .map((target) =>
            h('div', { key: target.id, className: 'row' }, [
              h('label', { key: 'select' }, [
                h('input', {
                  key: 'check',
                  type: 'checkbox',
                  checked: draft.targetIds.includes(target.id),
                  onChange: (event) =>
                    edit({
                      targetIds: event.target.checked
                        ? [...draft.targetIds, target.id]
                        : draft.targetIds.filter((id) => id !== target.id),
                    }),
                }),
                `${target.label} · ${target.network} · ${target.destination || t('publication.authenticatedAccount')}`,
              ]),
              action(
                t('publication.test'),
                () =>
                  perform(async () => {
                    const result = publicationRead(await api.test(target.id));
                    return result.verified
                      ? t('publication.identityVerified')
                      : (result.error ?? t('publication.notWritable'));
                  }),
                busy,
                { key: 'test' }
              ),
            ])
          ),
        !data.targets.some((target) => target.enabled) &&
          h('p', { key: 'empty' }, t('publication.noDestinations')),
        action(
          t('publication.selectAll'),
          () =>
            edit({
              targetIds: data.targets
                .filter((target) => target.enabled)
                .map((target) => target.id),
            }),
          busy,
          { key: 'all' }
        ),
        action(
          t('publication.selectNone'),
          () => edit({ targetIds: [] }),
          busy,
          { key: 'none' }
        ),
      ]
    ),
    h('label', { key: 'text', className: 'publication-field' }, [
      h('span', { key: 'label' }, t('publication.text')),
      h('textarea', {
        key: 'input',
        'aria-label': t('publication.text'),
        value: draft.text,
        rows: 4,
        maxLength: 100000,
        disabled: busy,
        onChange: (event) => edit({ text: event.target.value }),
      }),
    ]),
    toggle(t, 'debug', draft.debug ?? false, (debug) => edit({ debug }), {
      disabled: busy,
    }),
    plan && h(Preview, { key: 'preview', plan }),
    h('div', { key: 'actions', className: 'row' }, [
      action(
        t('common.preview'),
        preview,
        busy ||
          Boolean(draft.pending) ||
          Boolean(draft.completed) ||
          !draft.text.trim() ||
          !draft.targetIds.length,
        { key: 'preview' }
      ),
      action(
        t('publication.publish'),
        publish,
        busy || !plan || Boolean(draft.pending) || Boolean(draft.completed),
        { key: 'publish', className: 'primary' }
      ),
      action(t('publication.new'), reset, busy, { key: 'new' }),
      action(t('publication.refreshHistory'), reload, busy, { key: 'refresh' }),
    ]),
  ]);
};
