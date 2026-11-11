import React, { useEffect, useState } from 'react';
import { useT } from './i18n.js';
import { FormAssignmentPublisher } from './form-assignment-publisher.js';
const el = React.createElement;

export const FormAssignmentStatus = ({ assignment }) => {
  const t = useT();
  return assignment
    ? el(
        'div',
        {
          className: 'col',
          role: 'status',
          'data-form-assignment-state': assignment.state,
        },
        [
          el('p', { key: 'status' }, t(`forms.assignment.${assignment.state}`)),
          assignment.repository
            ? el(
                'a',
                {
                  key: 'repo',
                  href: assignment.repository.url,
                  target: '_blank',
                  rel: 'noreferrer',
                  style: { overflowWrap: 'anywhere' },
                },
                assignment.repository.url
              )
            : null,
        ]
      )
    : null;
};
export const FormAssignmentControl = ({
  api,
  inspection,
  assignment,
  busy,
  setBusy,
  onLinked,
  publishing,
}) => {
  const t = useT();
  const [repository, setRepository] = useState(
    assignment.repository?.url ?? ''
  );
  const [error, setError] = useState(null);
  const [checking, setChecking] = useState(false);
  useEffect(() => {
    setRepository(assignment.repository?.url ?? '');
    setError(null);
  }, [assignment.revision]);
  const submit = async (event) => {
    event.preventDefault();
    if (busy) {
      return;
    }
    setBusy(true);
    setChecking(true);
    setError(null);
    try {
      const result = await api.registerFormAssignment({
        inspection,
        repository,
        revision: assignment.revision,
      });
      onLinked(result.assignment);
    } catch (failure) {
      setError(failure.code ?? 'form-assignment-unconfirmed');
    } finally {
      setBusy(false);
      setChecking(false);
    }
  };
  return el('section', { className: 'card col', 'data-form-assignment': '' }, [
    el('h2', { key: 'title' }, t('forms.assignment.title')),
    el(FormAssignmentStatus, { key: 'status', assignment }),
    el('p', { key: 'hint', className: 'meta' }, t('forms.assignment.hint')),
    el('p', { key: 'scope', className: 'meta' }, t('forms.assignment.scope')),
    publishing && api.draftFormAssignment && api.publishFormAssignment
      ? el(FormAssignmentPublisher, {
          key: 'publisher',
          api,
          inspection,
          assignment,
          busy,
          setBusy,
          onLinked,
        })
      : null,
    api.registerFormAssignment
      ? el('form', { key: 'form', className: 'col', onSubmit: submit }, [
          el('label', { key: 'url', className: 'col' }, [
            t('forms.assignment.repository'),
            el('input', {
              key: 'input',
              type: 'url',
              required: true,
              value: repository,
              disabled: busy,
              'data-form-assignment-url': '',
              onChange: (event) => {
                setRepository(event.target.value);
                setError(null);
              },
            }),
          ]),
          el(
            'button',
            {
              key: 'submit',
              type: 'submit',
              disabled: busy,
              'aria-busy': checking,
              'data-action': 'link-assignment-repository',
            },
            t(checking ? 'forms.assignment.checking' : 'forms.assignment.link')
          ),
        ])
      : null,
    error
      ? el(
          'p',
          { key: 'error', role: 'alert', 'data-form-assignment-error': error },
          t('forms.assignment.error', { code: error })
        )
      : null,
  ]);
};
