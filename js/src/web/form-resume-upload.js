import React, { useEffect, useRef, useState } from 'react';
import { useT } from './i18n.js';

const el = React.createElement;
export const encodeResumeFile = async (file) => {
  if (!file || file.size > 8 * 1024 ** 2) {
    throw Object.assign(new Error('Choose a PDF of at most 8 MiB.'), {
      code: 'form-upload-file',
    });
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (let index = 0; index < bytes.length; index += 6144) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 6144));
  }
  return { name: file.name, data: globalThis.btoa(binary) };
};

export const useFormResumeUpload = ({ api, plan, busy, setBusy }) => {
  const [result, setResult] = useState(null);
  const [attempted, setAttempted] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const attach = async (fieldId, file, replaceExisting) => {
    if (busy || attempted) {
      return;
    }
    setBusy(true);
    setAttempted(true);
    let issued = false;
    try {
      const encoded = await encodeResumeFile(file);
      if (!mounted.current) {
        return;
      }
      issued = true;
      const value = await api.formsAttachReview({
        id: plan.reviewPlan.sessionId,
        planId: plan.reviewPlan.id,
        fieldId,
        file: encoded,
        replaceExisting,
      });
      setResult(
        value?.mode === 'upload-result'
          ? value
          : { state: 'uncertain', code: value?.code ?? 'form-upload-unknown' }
      );
    } catch (error) {
      setResult({
        state: issued ? 'uncertain' : 'refused',
        code: error.code ?? 'form-upload-unknown',
      });
    } finally {
      setBusy(false);
    }
  };
  return { result, attempted, attach };
};

export const FormResumeUploadResult = ({ result }) => {
  const t = useT();
  return result
    ? el(
        'p',
        { role: 'status', 'data-form-upload': result.state },
        t(`forms.upload.${result.state}`, {
          name: result.file?.name ?? '',
          code: result.code ?? '',
        })
      )
    : null;
};

export const FormResumeUpload = ({ field, onAttach, busy }) => {
  const t = useT();
  const [file, setFile] = useState(null);
  const [replace, setReplace] = useState(false);
  if (!onAttach || !field.answer?.uploadSupported) {
    return null;
  }
  return el('div', { className: 'col', 'data-form-upload-control': field.id }, [
    el('p', { key: 'hint', className: 'meta' }, t('forms.upload.hint')),
    el('label', { key: 'file', className: 'col' }, [
      t('forms.upload.choose'),
      el('input', {
        key: 'input',
        type: 'file',
        accept: '.pdf,application/pdf',
        disabled: busy,
        'data-form-resume': field.id,
        onChange: (event) => {
          setFile(event.target.files?.[0] ?? null);
          setReplace(false);
        },
      }),
    ]),
    file
      ? el(
          'p',
          { key: 'selected', 'data-form-resume-selected': '' },
          t('forms.upload.selected', { name: file.name, size: file.size })
        )
      : null,
    field.upload.files.length
      ? el('label', { key: 'replace', className: 'row' }, [
          el('input', {
            key: 'input',
            type: 'checkbox',
            checked: replace,
            disabled: busy,
            'data-form-resume-replace': field.id,
            onChange: (event) => setReplace(event.target.checked),
          }),
          t('forms.upload.replace'),
        ])
      : null,
    el(
      'button',
      {
        key: 'attach',
        type: 'button',
        disabled:
          busy ||
          !file ||
          file.size > 8 * 1024 ** 2 ||
          Boolean(field.upload.files.length && !replace),
        'data-form-attach': field.id,
        onClick: () => onAttach(field.id, file, replace),
      },
      t('forms.upload.attach')
    ),
  ]);
};
