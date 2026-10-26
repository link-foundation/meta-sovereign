// The source is read only after a click. A preview never writes contacts;
// Apply uses its one-use ticket. Nothing is uploaded to a messaging service.
import React, { useEffect, useRef, useState } from 'react';
import { useT } from './i18n.js';
import { Busy } from './spinner.js';
import { decodeVcard } from '../sources/vcard.js';

const el = React.createElement;
const MAX_FILE_BYTES = 10 * 1024 * 1024;

const Preview = ({ preview, busy, apply, cancel, t }) =>
  el('div', { className: 'col', 'data-contacts-preview': true }, [
    el(
      'p',
      { key: 'summary' },
      t('contacts.import.summary', {
        created: preview.created,
        updated: preview.updated,
        skipped: preview.unchanged + preview.invalid + preview.duplicates,
      })
    ),
    el(
      'ul',
      { key: 'sample' },
      (preview.sample ?? []).map((c, i) =>
        el(
          'li',
          { key: i },
          [c.name, ...(c.emails ?? []), ...(c.phones ?? [])].join(' · ')
        )
      )
    ),
    el('div', { key: 'actions', className: 'row' }, [
      el(
        'button',
        {
          key: 'apply',
          type: 'button',
          className: 'primary',
          'data-action': 'contacts-import-apply',
          disabled: busy || preview.created + preview.updated === 0,
          onClick: apply,
        },
        t('contacts.import.apply', { count: preview.created + preview.updated })
      ),
      el(
        'button',
        {
          key: 'cancel',
          type: 'button',
          className: 'ghost',
          disabled: busy,
          onClick: cancel,
        },
        t('contacts.import.cancel')
      ),
    ]),
  ]);

const errorMessage = (t, answer) => {
  const key = {
    'server-required': 'contacts.import.server',
    'contacts-permission-denied': 'contacts.import.permission',
    'contacts-preview-expired': 'contacts.import.expired',
    'contacts-unavailable': 'contacts.import.unavailable',
    'too-large': 'contacts.import.tooLarge',
  }[answer?.code];
  return key
    ? t(key)
    : t('contacts.import.failed', {
        error: answer?.error ?? answer?.message ?? '?',
      });
};

const useContactImport = (api, onImported, t) => {
  const file = useRef(null);
  const pending = useRef(false);
  const [sources, setSources] = useState(null);
  const [state, setState] = useState({
    busy: false,
    preview: null,
    error: null,
    imported: null,
  });
  useEffect(() => {
    let current = true;
    const load = () =>
      Promise.resolve(api.contactsImportSources?.()).then(
        (answer) => current && setSources(answer),
        () => current && setSources({ ok: false })
      );
    load();
    const interval = globalThis.setInterval(load, 30_000);
    globalThis.addEventListener?.('focus', load);
    return () => {
      current = false;
      globalThis.clearInterval(interval);
      globalThis.removeEventListener?.('focus', load);
    };
  }, [api]);
  const preview = async (body) => {
    if (pending.current) {
      return;
    }
    pending.current = true;
    setState({ busy: true, preview: null, error: null, imported: null });
    try {
      const answer = await api.contactsImportPreview(body);
      setState({
        busy: false,
        preview: answer?.ok ? answer : null,
        error: answer?.ok ? null : errorMessage(t, answer),
        imported: null,
      });
    } catch (error) {
      setState({
        busy: false,
        preview: null,
        error: errorMessage(t, error),
        imported: null,
      });
    } finally {
      pending.current = false;
    }
  };
  const selected = async (event) => {
    const picked = event.target.files?.[0];
    event.target.value = '';
    if (!picked) {
      return;
    }
    if (picked.size > MAX_FILE_BYTES) {
      setState({
        busy: false,
        preview: null,
        error: t('contacts.import.tooLarge'),
        imported: null,
      });
      return;
    }
    try {
      await preview({
        source: 'vcard',
        text: decodeVcard(await picked.arrayBuffer()),
      });
    } catch (error) {
      setState({
        busy: false,
        preview: null,
        error: errorMessage(t, error),
        imported: null,
      });
    }
  };
  const apply = async () => {
    if (pending.current) {
      return;
    }
    pending.current = true;
    const now = state.preview;
    setState((s) => ({ ...s, busy: true, error: null }));
    try {
      const answer = await api.contactsImportApply({
        source: now.source,
        digest: now.digest,
        confirmToken: now.confirm.token,
      });
      setState({
        busy: false,
        preview: null,
        error: answer?.ok ? null : errorMessage(t, answer),
        imported: answer?.ok ? answer.imported : null,
      });
      if (answer?.ok) {
        onImported();
      }
    } catch (error) {
      setState({
        busy: false,
        preview: null,
        error: errorMessage(t, error),
        imported: null,
      });
    } finally {
      pending.current = false;
    }
  };
  const cancel = () =>
    setState({ busy: false, preview: null, error: null, imported: null });
  return { file, sources, state, preview, selected, apply, cancel };
};

export const ContactsImport = ({ api, onImported }) => {
  const t = useT();
  const { file, sources, state, preview, selected, apply, cancel } =
    useContactImport(api, onImported, t);
  return el(
    'section',
    {
      className: 'card col contacts-import',
      'aria-label': t('contacts.import.title'),
    },
    [
      el('h3', { key: 'title' }, t('contacts.import.title')),
      el('p', { key: 'hint', className: 'meta' }, t('contacts.import.hint')),
      sources?.ok === false
        ? el(
            'p',
            { key: 'server', className: 'meta' },
            t('contacts.import.server')
          )
        : null,
      el('div', { key: 'sources', className: 'row' }, [
        el(
          'button',
          {
            key: 'system',
            type: 'button',
            'data-action': 'contacts-import-system',
            disabled: state.busy || !sources?.system?.available,
            onClick: () => preview({ source: 'system' }),
          },
          t('contacts.import.system')
        ),
        el(
          'button',
          {
            key: 'vcard',
            type: 'button',
            'data-action': 'contacts-import-vcard',
            disabled: state.busy || !sources?.ok,
            onClick: () => file.current?.click(),
          },
          t('contacts.import.vcard')
        ),
        el('input', {
          key: 'file',
          ref: file,
          type: 'file',
          accept: '.vcf,text/vcard,text/x-vcard',
          hidden: true,
          'data-field': 'contacts-vcard',
          onChange: selected,
        }),
      ]),
      state.busy
        ? el(
            Busy,
            { key: 'busy' },
            t(
              state.preview
                ? 'contacts.import.importing'
                : 'contacts.import.reading'
            )
          )
        : null,
      state.error
        ? el('p', { key: 'error', role: 'alert' }, state.error)
        : null,
      state.imported !== null
        ? el(
            'p',
            { key: 'done', role: 'status' },
            t('contacts.import.done', { count: state.imported })
          )
        : null,
      state.preview
        ? el(Preview, {
            key: 'preview',
            preview: state.preview,
            busy: state.busy,
            apply,
            cancel,
            t,
          })
        : null,
    ]
  );
};
