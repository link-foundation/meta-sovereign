import React, { useEffect, useRef, useState } from 'react';
import { useT } from './i18n.js';
import { encodeResumeFile } from './form-resume-upload.js';

const el = React.createElement;
const ResumeActions = ({
  busy,
  loading,
  error,
  file,
  resume,
  change,
  setProbe,
}) => {
  const t = useT();
  return el('div', { key: 'actions', className: 'row' }, [
    el(
      'button',
      {
        key: 'save',
        type: 'button',
        disabled:
          busy ||
          loading ||
          Boolean(error) ||
          !file ||
          file.size > 8 * 1024 ** 2,
        'data-save-form-resume': '',
        onClick: () => change('save'),
      },
      t('forms.resume.save')
    ),
    el(
      'button',
      {
        key: 'delete',
        type: 'button',
        disabled: busy || loading || Boolean(error) || !resume,
        'data-delete-form-resume': '',
        onClick: () => change('delete'),
      },
      t('forms.resume.delete')
    ),
    el(
      'button',
      {
        key: 'reload',
        type: 'button',
        disabled: busy || loading,
        'data-reload-form-resume': '',
        onClick: () => setProbe((n) => n + 1),
      },
      t('forms.resume.reload')
    ),
  ]);
};

export const FormResumeSettings = ({ api, busy, setBusy, onChanged }) => {
  const t = useT();
  const inputRef = useRef(null);
  const [resume, setResume] = useState(null);
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [probe, setProbe] = useState(0);
  useEffect(() => {
    let current = true;
    setLoading(true);
    Promise.resolve()
      .then(() => api.formsResume())
      .then(
        (result) => {
          if (current) {
            setResume(result.resume);
            setError(null);
          }
        },
        (failed) => {
          if (current) {
            setError(failed.code ?? 'form-resume-unconfirmed');
          }
        }
      )
      .finally(() => {
        if (current) {
          setLoading(false);
        }
      });
    return () => {
      current = false;
    };
  }, [api, probe]);
  const change = async (action) => {
    if (busy || loading || error) {
      return;
    }
    setBusy(true);
    try {
      const input = { revision: resume?.revision ?? null };
      if (action === 'save') {
        input.file = await encodeResumeFile(file);
      }
      const result = await (
        action === 'save' ? api.saveFormsResume : api.deleteFormsResume
      )(input);
      setResume(result.resume);
      setFile(null);
      if (inputRef.current) {
        inputRef.current.value = '';
      }
      onChanged();
    } catch (failed) {
      setError(failed.code ?? 'form-resume-unconfirmed');
    } finally {
      setBusy(false);
    }
  };
  return el(
    'section',
    { className: 'card col', 'data-form-resume-settings': '' },
    [
      el('h2', { key: 'title' }, t('forms.resume.title')),
      el('p', { key: 'hint', className: 'meta' }, t('forms.resume.hint')),
      el(
        'p',
        {
          key: 'status',
          role: 'status',
          'data-saved-form-resume': resume?.revision ?? '',
        },
        t(
          loading
            ? 'forms.resume.loading'
            : error
              ? 'forms.resume.unknown'
              : resume
                ? 'forms.resume.saved'
                : 'forms.resume.empty',
          resume ?? {}
        )
      ),
      el('label', { key: 'file', className: 'col' }, [
        t('forms.upload.choose'),
        el('input', {
          key: 'input',
          ref: inputRef,
          type: 'file',
          accept: '.pdf,application/pdf',
          disabled: busy || loading,
          'data-save-form-resume-file': '',
          onChange: (event) => setFile(event.target.files?.[0] ?? null),
        }),
      ]),
      file
        ? el(
            'p',
            { key: 'selected' },
            t('forms.upload.selected', { name: file.name, size: file.size })
          )
        : null,
      el(ResumeActions, {
        key: 'actions',
        busy,
        loading,
        error,
        file,
        resume,
        change,
        setProbe,
      }),
      error
        ? el(
            'p',
            { key: 'error', role: 'alert', 'data-form-resume-error': error },
            t(
              error === 'form-resume-changed'
                ? 'forms.resume.changed'
                : 'forms.resume.error',
              { code: error }
            )
          )
        : null,
    ]
  );
};
