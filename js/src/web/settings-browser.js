import React, { useState } from 'react';
import { useT } from './i18n.js';
import { useFeedbackRead } from './feedback-read.js';
import { BROWSER_CASES } from '../browser/policy.js';

const el = React.createElement;
const Select = ({ label, action, value, values, text, onChange, disabled }) =>
  el('label', { className: 'chat-form-field' }, [
    el('span', { key: 'l', className: 'meta' }, label),
    el(
      'select',
      {
        key: 's',
        value,
        disabled,
        'data-action': action,
        onChange: (event) => onChange(event.target.value),
      },
      values.map((id) => el('option', { key: id, value: id }, text(id)))
    ),
  ]);

const Name = ({ name, value, onChange, disabled, t }) =>
  el('label', { className: 'chat-form-field' }, [
    el('span', { key: 'l', className: 'meta' }, t(`browser.${name}`)),
    el('input', {
      key: 'i',
      value,
      disabled,
      maxLength: 64,
      'data-field': `browser-${name}`,
      onChange: (event) => onChange(event.target.value),
    }),
  ]);

const PolicyEditor = ({ api, policies, t }) => {
  const [scope, setScope] = useState('default');
  const [useCase, setCase] = useState('cv');
  const [platform, setPlatform] = useState('hh');
  const [slot, setSlot] = useState('main');
  const [choice, setChoice] = useState(null);
  const [saved, setSaved] = useState([]);
  const [status, setStatus] = useState('');
  const key =
    scope === 'default'
      ? 'default'
      : scope === 'case'
        ? useCase
        : `${platform}/${slot}`;
  const selected = [...policies, ...saved].findLast(
    (p) => p.scope === scope && p.key === key
  );
  const mode =
    choice ??
    (selected?.headless === true
      ? 'headless'
      : selected?.headless === false || scope === 'default'
        ? 'visible'
        : 'inherit');
  const busy = status === 'saving';
  const change = (set) => (value) => {
    set(value);
    setChoice(null);
    setStatus('');
  };
  const save = async (event) => {
    event.preventDefault();
    setStatus('saving');
    try {
      const answer = await api.saveBrowserPolicy({
        scope,
        key,
        headless: mode === 'inherit' ? null : mode === 'headless',
      });
      if (!answer?.ok) {
        throw new Error('save failed');
      }
      setSaved((before) => [
        ...before.filter((p) => p.id !== answer.policy.id),
        answer.policy,
      ]);
      setChoice(null);
      setStatus('saved');
    } catch {
      setStatus('failed');
    }
  };
  return el('form', { onSubmit: save }, [
    el('div', { key: 'target', className: 'row' }, [
      el(Select, {
        key: 'scope',
        label: t('browser.scope'),
        action: 'browser-scope',
        value: scope,
        values: ['default', 'case', 'slot'],
        text: (id) => t(`browser.scope.${id}`),
        onChange: change(setScope),
        disabled: busy,
      }),
      scope === 'case'
        ? el(Select, {
            key: 'case',
            label: t('browser.workflow'),
            action: 'browser-case',
            value: useCase,
            values: BROWSER_CASES,
            text: (id) => t(`browser.case.${id}`),
            onChange: change(setCase),
            disabled: busy,
          })
        : null,
      scope === 'slot'
        ? el(Name, {
            key: 'platform',
            name: 'platform',
            value: platform,
            onChange: change(setPlatform),
            disabled: busy,
            t,
          })
        : null,
      scope === 'slot'
        ? el(Name, {
            key: 'slot',
            name: 'slot',
            value: slot,
            onChange: change(setSlot),
            disabled: busy,
            t,
          })
        : null,
      el(Select, {
        key: 'mode',
        label: t('browser.mode'),
        action: 'browser-mode',
        value: mode,
        values:
          scope === 'default'
            ? ['visible', 'headless']
            : ['inherit', 'visible', 'headless'],
        text: (id) => t(`browser.mode.${id}`),
        onChange: (value) => {
          setChoice(value);
          setStatus('');
        },
        disabled: busy,
      }),
    ]),
    scope === 'slot'
      ? el('p', { key: 'slotHint', className: 'meta' }, t('browser.slotHint'))
      : null,
    el(
      'button',
      {
        key: 'save',
        type: 'submit',
        disabled: busy,
        'data-action': 'browser-save',
      },
      t('browser.save')
    ),
    status
      ? el(
          'p',
          { key: 'status', role: 'status', 'data-browser-status': status },
          t(`browser.${status}`)
        )
      : null,
  ]);
};

export const BrowserSettings = ({ api }) => {
  const t = useT();
  const read = useFeedbackRead(() => api.browserPolicies(), 'browser-policies');
  // A standalone mobile/PWA cannot launch a desktop browser. Show these
  // server preferences only when a connected server actually offers them.
  if (!read.loading && !read.data?.available) {
    return null;
  }
  return el('section', { className: 'card browser-settings' }, [
    el('h3', { key: 'h' }, t('browser.title')),
    el('p', { key: 'hint', className: 'meta' }, t('browser.hint')),
    read.loading
      ? el('p', { key: 'loading', role: 'status' }, t('browser.loading'))
      : el(PolicyEditor, {
          key: 'editor',
          api,
          policies: read.data.policies,
          t,
        }),
  ]);
};
