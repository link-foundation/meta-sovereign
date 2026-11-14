import React from 'react';
import { useDates } from './i18n.js';

const el = React.createElement;
const canStart = (state, exports) =>
  !state.busy &&
  !exports.statusLost &&
  state.capabilities?.resumeExport === true &&
  state.browserValid &&
  (exports.scope !== 'selected' ||
    /^[a-zA-Z0-9_-]{1,100}$/u.test(state.values.resume));
const ExportSettings = ({ exports, idle, t }) =>
  el(
    'fieldset',
    { key: 'settings', className: 'automation-fieldset', disabled: !idle },
    [
      el('legend', { key: 'legend' }, t('vacancy.exportSettings')),
      el('label', { key: 'scope', className: 'chat-form-field' }, [
        el('span', { key: 'label' }, t('vacancy.exportScope')),
        el(
          'select',
          {
            key: 'input',
            'data-resume-export-scope': true,
            value: exports.scope,
            onChange: (event) => exports.setScope(event.target.value),
          },
          ['latest', 'selected', 'all'].map((scope) =>
            el(
              'option',
              { key: scope, value: scope },
              t(`vacancy.exportScope.${scope}`)
            )
          )
        ),
      ]),
      el(
        'div',
        { key: 'formats', className: 'row' },
        ['pdf', 'rtf', 'doc', 'html'].map((format) =>
          el('label', { key: format, className: 'check' }, [
            el('input', {
              key: 'input',
              type: 'checkbox',
              'data-resume-export-format': format,
              checked: exports.formats.includes(format),
              disabled: format === 'html',
              onChange: (event) =>
                exports.setFormats(
                  event.target.checked
                    ? [...exports.formats, format]
                    : exports.formats.filter((value) => value !== format)
                ),
            }),
            format.toUpperCase(),
          ])
        )
      ),
    ]
  );

export const ResumeExports = ({ state, t }) => {
  const { dateTime } = useDates();
  const exports = state.resumeExports;
  const idle = !state.busy;
  const running = exports.job?.state === 'running';
  const button = (id, label, onClick, disabled) =>
    el(
      'button',
      {
        key: id,
        type: 'button',
        'data-resume-export-action': id,
        onClick,
        disabled,
      },
      label
    );
  return el(
    'section',
    {
      className: 'col',
      'data-resume-exports': true,
      'aria-label': t('vacancy.exports'),
    },
    [
      el('h3', { key: 'title' }, t('vacancy.exports')),
      el('p', { key: 'hint', className: 'meta' }, t('vacancy.exportHint')),
      el(ExportSettings, { key: 'settings', exports, idle, t }),
      el('div', { key: 'actions', className: 'row' }, [
        button(
          'start',
          t('vacancy.exportStart'),
          exports.start,
          !canStart(state, exports)
        ),
        button(
          'recover',
          t('vacancy.exportRecover'),
          exports.recover,
          !exports.requestId || (state.busy && !running)
        ),
        running || exports.statusLost
          ? button(
              'stop',
              t('vacancy.stop'),
              exports.stop,
              !exports.requestId || state.busy === 'resume-export-cancel'
            )
          : null,
      ]),
      exports.statusLost
        ? el(
            'p',
            {
              key: 'unknown',
              role: 'status',
              'data-resume-export-unknown': true,
            },
            t('vacancy.exportUnknown')
          )
        : null,
      exports.job
        ? el(
            'p',
            {
              key: 'status',
              role: 'status',
              'data-resume-export-state': exports.job.state,
              'data-resume-export-request': exports.job.requestId,
            },
            [
              t(`vacancy.exportState.${exports.job.state}`),
              ' · ',
              t('vacancy.exportProgress', {
                count: exports.job.results.length,
                total: exports.job.total ?? '?',
              }),
              exports.job.code ? ` (${exports.job.code})` : '',
            ]
          )
        : null,
      ...exports.exports.map((result) =>
        el(
          'article',
          {
            key: result.hash,
            className: 'col',
            'data-resume-export': result.hash,
          },
          [
            el(
              'h4',
              { key: 'title' },
              `${result.title} · ${result.language.toUpperCase()}`
            ),
            el(
              'p',
              { key: 'date', className: 'meta' },
              dateTime(result.capturedAt)
            ),
            el(
              'p',
              { key: 'privacy', className: 'meta' },
              t('vacancy.exportRemoved', {
                count: result.sanitization.removedLines,
              })
            ),
            el(
              'div',
              { key: 'files', className: 'row' },
              result.files.map((file) =>
                button(
                  `${result.hash}-${file.name}`,
                  `${file.name} · ${t(file.native ? 'vacancy.exportNative' : 'vacancy.exportSanitized')}`,
                  () => exports.download(result, file),
                  !idle
                )
              )
            ),
          ]
        )
      ),
    ]
  );
};
