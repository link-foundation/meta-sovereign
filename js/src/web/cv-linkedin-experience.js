import React, { useEffect, useRef, useState } from 'react';
import { useT } from './i18n.js';
import { createLinkedinExperienceState } from './cv-linkedin-experience-state.js';

const el = React.createElement;
const phaseLabel = (row) =>
  row.code === 'cv-linkedin-login-required'
    ? 'linkedinExperience.loginRequired'
    : `linkedinExperience.phase.${row.phase}`;
const active = (row) =>
  ['opening', 'waiting-login', 'reading'].includes(row?.phase);
export const CvLinkedinExperienceScreen = ({
  state,
  actions,
  select,
  selecting,
}) => {
  const t = useT();
  const locked = state.busy || state.attempted;
  const button = (id, label, onClick, disabled) =>
    el(
      'button',
      {
        key: id,
        type: 'button',
        'data-linkedin-experience-action': id,
        onClick,
        disabled,
      },
      t(`linkedinExperience.${label}`)
    );
  const field = (name, type = 'text') =>
    el('label', { key: name, className: 'chat-form-field' }, [
      el('span', { key: 'label' }, t(`linkedinExperience.${name}`)),
      el('input', {
        key: 'input',
        type,
        value: state[name],
        disabled: locked,
        'data-linkedin-experience-field': name,
        onChange: (event) => actions.input(name, event.target.value),
      }),
    ]);
  return el('section', { className: 'col', 'data-linkedin-experience': true }, [
    el('h3', { key: 'title' }, t('linkedinExperience.title')),
    el('p', { key: 'hint', className: 'meta' }, t('linkedinExperience.hint')),
    field('url', 'url'),
    field('requestId'),
    el('label', { key: 'language', className: 'chat-form-field' }, [
      el('span', { key: 'label' }, t('linkedinExperience.language')),
      el(
        'select',
        {
          key: 'input',
          value: state.language,
          disabled: locked,
          'data-linkedin-experience-field': 'language',
          onChange: (event) => actions.input('language', event.target.value),
        },
        ['en', 'ru'].map((code) =>
          el(
            'option',
            { key: code, value: code },
            t(`linkedinExperience.${code}`)
          )
        )
      ),
    ]),
    el('div', { key: 'actions', className: 'row wrap' }, [
      button(
        'start',
        'start',
        () => actions.mutate('Start'),
        locked || !state.url || !state.requestId
      ),
      button(
        'status',
        'status',
        () => actions.refresh(),
        state.busy || !state.requestId
      ),
      button(
        'stop',
        'stop',
        () => actions.mutate('Stop'),
        state.busy || !state.requestId
      ),
      button(
        'new',
        'new',
        () => actions.newRequest(),
        state.busy || state.unknown || active(state.row)
      ),
    ]),
    state.row
      ? el(
          'p',
          {
            key: 'state',
            role: 'status',
            'data-linkedin-experience-phase': state.row.phase,
          },
          t(phaseLabel(state.row))
        )
      : null,
    state.row?.options
      ? el(
          'p',
          {
            key: 'target',
            className: 'meta',
            style: { overflowWrap: 'anywhere' },
          },
          state.row.options.url
        )
      : null,
    state.unknown
      ? el(
          'p',
          { key: 'unknown', role: 'status' },
          t('linkedinExperience.unknown')
        )
      : null,
    state.error
      ? el('p', { key: 'error', role: 'alert' }, t('linkedinExperience.error'))
      : null,
    state.row?.phase === 'completed'
      ? el('div', { key: 'completed', className: 'row wrap' }, [
          button(
            'select',
            'select',
            () => select(state.row.revision),
            selecting
          ),
          ...['txt', 'json'].map((suffix) =>
            button(
              `evidence-${suffix}`,
              suffix,
              () => actions.evidence(`linkedin-experience.${suffix}`),
              state.busy
            )
          ),
        ])
      : null,
  ]);
};
export const CvLinkedinExperience = ({ api, select, selecting }) => {
  const [state, setState] = useState(null);
  const actions = useRef(null);
  useEffect(() => {
    const current = createLinkedinExperienceState(api, setState);
    actions.current = current;
    return () => current.dispose();
  }, [api]);
  return state
    ? el(CvLinkedinExperienceScreen, {
        state,
        actions: actions.current,
        select,
        selecting,
      })
    : null;
};
