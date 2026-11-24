import React, { useState } from 'react';
import { api as defaultApi } from './dom.js';
import { useT, useDates } from './i18n.js';
import { useFeedbackRead } from './feedback-read.js';
import { PageLoading } from './spinner.js';
import { ConfirmDialog } from './settings-confirm.js';

const el = React.createElement;
const MAX_HOURS = Math.floor(0x7fffffff / 3_600_000);

const confirmed = (action, result) =>
  action === 'saved'
    ? result.ok === true && result.settings?.available === true
    : action === 'created'
      ? typeof result.file === 'string' && Array.isArray(result.recovery)
      : Number.isInteger(result.restored) && result.restored >= 0;

const Schedule = ({ settings, save, busy, t }) => {
  const [hours, setHours] = useState(String(settings.intervalHours));
  const [keep, setKeep] = useState(String(settings.keep));
  const [formats, setFormats] = useState(settings.formats);
  const field = (name, value, set, max) =>
    el('label', { key: name, className: 'chat-form-field' }, [
      el('span', { key: 'l' }, t(`backup.${name}`)),
      el('input', {
        key: 'i',
        type: 'number',
        min: 0,
        max,
        step: name === 'hours' ? 'any' : 1,
        required: true,
        value,
        disabled: busy,
        'data-field': `backup-${name}`,
        onChange: (event) => set(event.target.value),
      }),
    ]);
  return el(
    'form',
    {
      className: 'card col',
      'data-section': 'recovery-schedule',
      onSubmit: (event) => {
        event.preventDefault();
        save({ intervalHours: Number(hours), keep: Number(keep), formats });
      },
    },
    [
      el('h3', { key: 'h' }, t('backup.schedule')),
      el('p', { key: 'hint', className: 'meta' }, t('backup.scheduleHint')),
      el('div', { key: 'numbers', className: 'row' }, [
        field('hours', hours, setHours, MAX_HOURS),
        field('retention', keep, setKeep, 10_000),
      ]),
      el('fieldset', { key: 'formats', disabled: busy }, [
        el('legend', { key: 'l' }, t('backup.formats')),
        el(
          'div',
          { key: 'choices', className: 'row' },
          ['text', 'binary'].map((format) =>
            el('label', { key: format, className: 'check' }, [
              el('input', {
                key: 'i',
                type: 'checkbox',
                checked: formats.includes(format),
                'data-field': `backup-${format}`,
                onChange: (event) =>
                  setFormats((before) =>
                    event.target.checked
                      ? [...before, format]
                      : before.filter((item) => item !== format)
                  ),
              }),
              ` ${t(`backup.format.${format}`)}`,
            ])
          )
        ),
      ]),
      el(
        'button',
        {
          key: 'save',
          type: 'submit',
          disabled: busy,
          'data-action': 'backup-save',
        },
        t('backup.save')
      ),
    ]
  );
};

const Files = ({ files, busy, restore, t, dateTime }) =>
  files.length
    ? files.map((file) =>
        el(
          'div',
          {
            key: file.file,
            className: 'card row',
            'data-backup-file': file.file,
          },
          [
            el('div', { key: 'info', className: 'col grow' }, [
              el(
                'strong',
                { key: 'name', className: 'backup-filename' },
                file.file
              ),
              el(
                'span',
                { key: 'format', className: 'meta' },
                t(`backup.format.${file.format ?? 'archive'}`)
              ),
              el(
                'span',
                { key: 'meta', className: 'meta' },
                t('backup.itemMeta', {
                  size: file.size,
                  timestamp: dateTime(file.mtime),
                  state: t(
                    file.encrypted ? 'backup.encrypted' : 'backup.plain'
                  ),
                })
              ),
            ]),
            el(
              'button',
              {
                key: 'restore',
                type: 'button',
                disabled: busy,
                onClick: () => restore(file.file),
              },
              t('backup.restore')
            ),
          ]
        )
      )
    : el('p', { className: 'meta' }, t('backup.empty'));

export const BackupView = ({ api = defaultApi }) => {
  const t = useT();
  const { dateTime } = useDates();
  const read = useFeedbackRead(
    async () => ({
      settings: await api.recoverySettings(),
      files: await api.listBackups(),
    }),
    'backups'
  );
  const [passphrase, setPassphrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [restore, setRestore] = useState(null);
  const run = async (action, task) => {
    if (busy) {
      return;
    }
    setBusy(true);
    setStatus(t('backup.working'));
    try {
      const result = await task();
      if (!result) {
        throw new Error('operation not confirmed');
      }
      if (result.ok === false || result.error) {
        setStatus(
          t('backup.refused', {
            reason: result.error ?? result.code ?? t('backup.failed'),
          })
        );
        return;
      }
      if (!confirmed(action, result)) {
        throw new Error('operation not confirmed');
      }
      setStatus(
        t(`backup.${action}`, {
          count: result.restored ?? result.recovery?.length ?? 0,
        })
      );
    } catch {
      setStatus(t('backup.failed'));
    } finally {
      setBusy(false);
      read.refresh();
    }
  };
  if (read.loading) {
    return el(PageLoading);
  }
  return el('div', { className: 'col' }, [
    el('h2', { key: 'h' }, t('backup.title')),
    read.data.settings.available
      ? el(React.Fragment, { key: 'available' }, [
          el('p', { key: 'hint', className: 'meta' }, t('backup.hint')),
          el(Schedule, {
            key: 'settings',
            settings: read.data.settings,
            busy,
            t,
            save: (settings) =>
              run('saved', () => api.saveRecoverySettings(settings)),
          }),
          el('div', { key: 'create', className: 'row' }, [
            el('input', {
              key: 'pass',
              type: 'password',
              placeholder: t('backup.passphrasePlaceholder'),
              'aria-label': t('backup.passphrasePlaceholder'),
              className: 'grow',
              value: passphrase,
              disabled: busy,
              onChange: (event) => setPassphrase(event.target.value),
            }),
            el(
              'button',
              {
                key: 'button',
                type: 'button',
                className: 'primary',
                disabled: busy,
                'data-action': 'backup-create',
                onClick: () =>
                  run('created', () =>
                    api.createBackup({ passphrase: passphrase || null })
                  ),
              },
              t('backup.create')
            ),
          ]),
          el('p', { key: 'raw', className: 'meta' }, t('backup.rawHint')),
          el(
            'p',
            { key: 'status', role: 'status', 'data-backup-status': true },
            status
          ),
          el(Files, {
            key: 'files',
            files: read.data.files,
            busy,
            restore: setRestore,
            t,
            dateTime,
          }),
        ])
      : el(
          'p',
          { key: 'unavailable', className: 'meta' },
          t('backup.unavailable')
        ),
    restore
      ? el(ConfirmDialog, {
          key: 'confirm',
          name: 'backup-restore',
          title: t('backup.restore'),
          text: t('backup.restoreAsk', { file: restore }),
          yes: t('backup.restore'),
          onNo: () => setRestore(null),
          onYes: () => {
            const file = restore;
            setRestore(null);
            run('restored', () => api.restoreBackup(file, passphrase || null));
          },
        })
      : null,
  ]);
};
