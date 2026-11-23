import React, { useEffect, useRef, useState } from 'react';
import { useT } from './i18n.js';
import {
  canSaveRunnerProfile,
  editRunnerProfile,
} from './runner-profile-state.js';
import {
  RunnerDeploymentSettings,
  runnerSourceModes,
} from './settings-runner-deployment.js';

const el = React.createElement;
const Editor = ({ api, onPrepared }) => {
  const t = useT();
  const [state, setState] = useState({ draft: '', busy: true });
  const owner = useRef(null);
  useEffect(() => {
    const control = editRunnerProfile({
      request: api.runnerProfileRequest,
      update: setState,
    });
    owner.current = control;
    return control.close;
  }, [api]);
  return el(
    'div',
    {
      className: 'col',
      'aria-busy': state.busy,
      'data-runner-profile-editor': '',
    },
    [
      el('p', { key: 'hint', className: 'meta' }, t('runner.profileHint')),
      state.error
        ? el('p', { key: 'error', role: 'alert' }, t('runner.profileError'))
        : null,
      state.busy
        ? el(
            'p',
            { key: 'pending', role: 'status' },
            t('runner.profileChecking')
          )
        : null,
      state.acknowledged
        ? el(
            'p',
            { key: 'saved', role: 'status', 'data-runner-profile-saved': '' },
            t('runner.profileSaved')
          )
        : null,
      el('label', { key: 'document', className: 'col' }, [
        el('span', { key: 'label' }, t('runner.profileDocument')),
        el('textarea', {
          key: 'input',
          rows: 14,
          maxLength: 65536,
          value: state.draft,
          spellCheck: false,
          disabled: !state.saved || state.pending === 'profile',
          onChange: (event) => owner.current?.edit(event.target.value),
          'data-runner-profile-document': '',
        }),
      ]),
      el(
        'button',
        {
          key: 'save',
          type: 'button',
          disabled: !canSaveRunnerProfile(state),
          onClick: () => void owner.current?.save(),
          'data-runner-profile-save': '',
        },
        t('runner.profileSave')
      ),
      el(
        'button',
        {
          key: 'reload',
          type: 'button',
          disabled: state.busy,
          onClick: () => void owner.current?.reload(),
          'data-runner-profile-reload': '',
        },
        t('runner.profileReload')
      ),
      ...runnerSourceModes(state.saved?.document).map((mode) =>
        el(RunnerDeploymentSettings, {
          key: `${mode}:${state.saved.revision}`,
          api,
          mode,
          disabled: state.busy || state.draft !== state.saved.document,
          onPrepared,
        })
      ),
    ]
  );
};

export const RunnerProfileSettings = ({ api, onPrepared }) => {
  const t = useT();
  const [open, setOpen] = useState(false);
  return el(
    'details',
    {
      'data-runner-profile': '',
      onToggle: (event) => setOpen(event.currentTarget.open),
    },
    [
      el(
        'summary',
        { key: 'summary', 'data-runner-profile-open': '' },
        t('runner.profileTitle')
      ),
      open ? el(Editor, { key: 'editor', api, onPrepared }) : null,
    ]
  );
};
