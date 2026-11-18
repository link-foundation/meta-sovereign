import React, { useEffect, useRef, useState } from 'react';
import { useT } from './i18n.js';
import { isDiagnosticSettings } from '../transport/diagnostic-settings.js';

const el = React.createElement;
const download = (blob, name) => {
  const url = globalThis.URL.createObjectURL(blob);
  const anchor = globalThis.document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  globalThis.setTimeout(() => globalThis.URL.revokeObjectURL(url), 1000);
};

export const DiagnosticConfiguration = ({ api }) => {
  const t = useT();
  const [data, setData] = useState(null);
  const [verbose, setVerbose] = useState(true);
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState('loading');
  const [revision, setRevision] = useState(0);
  const owner = useRef(null);
  useEffect(() => {
    const controller = new AbortController();
    owner.current = controller;
    setState('loading');
    const load = async () => {
      try {
        const answer = await api.diagnosticSettings(controller.signal);
        if (!isDiagnosticSettings(answer)) {
          throw new Error('invalid settings');
        }
        if (!controller.signal.aborted) {
          setData(answer);
          setVerbose(answer.verbose);
          setState('');
        }
      } catch {
        if (!controller.signal.aborted) {
          setState('settingsFailed');
        }
      }
    };
    void load();
    return () => controller.abort();
  }, [api, revision]);
  const act = async (kind) => {
    if (busy || owner.current?.signal.aborted) {
      return;
    }
    setBusy(true);
    setState('');
    try {
      if (kind === 'save') {
        const answer = await api.saveDiagnosticSettings(
          { verbose },
          owner.current.signal
        );
        if (!isDiagnosticSettings(answer) || answer.verbose !== verbose) {
          throw new Error('save unconfirmed');
        }
        if (!owner.current.signal.aborted) {
          setData(answer);
          setState('settingsSaved');
        }
      } else {
        const blob = await api.diagnosticSession(owner.current.signal);
        if (!owner.current.signal.aborted) {
          download(blob, data.session.file);
        }
      }
    } catch {
      if (!owner.current.signal.aborted) {
        setState(kind === 'save' ? 'settingsFailed' : 'downloadFailed');
      }
    } finally {
      if (!owner.current.signal.aborted) {
        setBusy(false);
      }
    }
  };
  return el('div', { className: 'col', 'data-diagnostic-configuration': '' }, [
    el('p', { key: 'hint', className: 'meta' }, t('diagnostics.verboseHint')),
    el('label', { key: 'verbose', className: 'check' }, [
      el('input', {
        key: 'input',
        type: 'checkbox',
        checked: verbose,
        disabled: busy || !data,
        'data-action': 'diagnostics-verbose',
        onChange: (event) => {
          setVerbose(event.target.checked);
          setState('');
        },
      }),
      t('diagnostics.verbose'),
    ]),
    el(
      'button',
      {
        key: 'save',
        type: 'button',
        disabled: busy || !data || verbose === data.verbose,
        'data-action': 'diagnostics-save',
        onClick: () => act('save'),
      },
      t('diagnostics.save')
    ),
    el(
      'button',
      {
        key: 'reload',
        type: 'button',
        disabled: busy,
        'data-action': 'diagnostics-reload',
        onClick: () => setRevision((value) => value + 1),
      },
      t('diagnostics.reload')
    ),
    data
      ? el(
          'p',
          {
            key: 'file',
            className: 'meta',
            style: { overflowWrap: 'anywhere' },
            'data-diagnostic-session': data.session.persisted
              ? 'persisted'
              : 'memory',
          },
          data.session.persisted
            ? t('diagnostics.sessionFile', { file: data.session.file })
            : t('diagnostics.sessionMemory')
        )
      : null,
    data?.session.dropped
      ? el('p', { key: 'dropped', role: 'alert' }, t('diagnostics.writeFailed'))
      : null,
    data?.session.persisted
      ? el(
          'button',
          {
            key: 'download',
            type: 'button',
            disabled: busy,
            'data-action': 'diagnostics-download',
            onClick: () => act('download'),
          },
          t('diagnostics.download')
        )
      : null,
    state
      ? el(
          'p',
          {
            key: 'state',
            role: state.endsWith('Failed') ? 'alert' : 'status',
            'data-diagnostic-configuration-state': state,
          },
          t(`diagnostics.${state}`)
        )
      : null,
  ]);
};
