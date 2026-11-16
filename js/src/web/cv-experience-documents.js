import React, { useEffect, useRef, useState } from 'react';
import { useT, useDates } from './i18n.js';
import { Busy } from './spinner.js';
import { LINO_TEXT, LINO_BINARY } from '../transport/lino.js';
import {
  createExperienceState,
  experienceExportKey,
} from './cv-experience-state.js';
import { CvExperienceComparison } from './cv-experience-view.js';

const el = React.createElement;
const button = (id, text, onClick, disabled) =>
  el(
    'button',
    {
      key: id,
      type: 'button',
      'data-experience-action': id,
      onClick,
      disabled,
    },
    text
  );
const SnapshotChoice = ({ platform, state, actions }) => {
  const t = useT();
  const { dateTime } = useDates();
  return el('div', { className: 'col' }, [
    el('label', { key: 'label', className: 'chat-form-field' }, [
      el(
        'span',
        { key: 'text' },
        t('experienceFiles.snapshot', {
          platform: platform === 'hh' ? 'HH' : 'LinkedIn',
        })
      ),
      el(
        'select',
        {
          key: 'select',
          value: state.choices[platform],
          disabled: state.busy,
          'data-experience-choice': platform,
          onChange: (event) => actions.choose(platform, event.target.value),
        },
        [
          el('option', { key: 'none', value: '' }, t('experienceFiles.choose')),
          ...(state.entries ?? [])
            .filter((row) => row.platform === platform)
            .map((row) =>
              el(
                'option',
                {
                  key: row.revision,
                  value: row.revision,
                },
                `${row.source.id} · ${row.source.language} · ${dateTime(row.source.capturedAt)} · ${row.revision.slice(0, 12)}`
              )
            ),
        ]
      ),
    ]),
    el(
      'div',
      { key: 'download', className: 'row wrap' },
      [
        [LINO_TEXT, 'lino', 'text'],
        [LINO_BINARY, 'bin', 'binary'],
      ].map(([type, id, label]) =>
        button(
          `download-${platform}-${id}`,
          t(`experienceFiles.${label}`),
          () => actions.download(platform, type),
          state.busy || !state.choices[platform]
        )
      )
    ),
  ]);
};
const ExistingHhExport = ({ state, actions }) => {
  const t = useT();
  return el('div', { className: 'col' }, [
    el('label', { key: 'choice', className: 'chat-form-field' }, [
      el('span', { key: 'label' }, t('experienceFiles.hhExport')),
      el(
        'select',
        {
          key: 'select',
          value: state.exportKey,
          disabled: state.busy,
          'data-experience-hh-export': true,
          onChange: (event) => actions.exportKey(event.target.value),
        },
        [
          el('option', { key: 'none', value: '' }, t('experienceFiles.choose')),
          ...(state.exports ?? []).map((item) =>
            el(
              'option',
              {
                key: experienceExportKey(item),
                value: experienceExportKey(item),
              },
              `${item.title} · ${item.language} · ${item.browserSlot} · ${item.exportId}`
            )
          ),
        ]
      ),
    ]),
    button(
      'from-hh',
      t('experienceFiles.reuseHh'),
      () => actions.fromHh(),
      state.busy || !state.exportKey
    ),
  ]);
};
export const CvExperienceDocumentsScreen = ({ state, actions }) => {
  const t = useT();
  return el(
    'details',
    { className: 'col card', 'data-experience-documents': true },
    [
      el('summary', { key: 'title' }, t('experienceFiles.title')),
      el('p', { key: 'hint', className: 'meta' }, t('experienceFiles.hint')),
      el('label', { key: 'file', className: 'chat-form-field' }, [
        el('span', { key: 'label' }, t('experienceFiles.file')),
        el('input', {
          key: 'input',
          type: 'file',
          accept: '.lino,.bin,.json',
          disabled: state.busy,
          'data-experience-file': true,
          onChange: (event) => actions.file(event.target.files?.[0] ?? null),
        }),
      ]),
      el('div', { key: 'import', className: 'row wrap' }, [
        button(
          'import',
          t('experienceFiles.import'),
          () => actions.import(),
          state.busy || !state.file
        ),
        button(
          'reload',
          t('experienceFiles.reload'),
          () => actions.reload(),
          state.busy
        ),
      ]),
      state.busy ? el(Busy, { key: 'busy' }, t('experienceFiles.busy')) : null,
      state.error
        ? el(
            'p',
            { key: 'error', role: 'alert', 'data-experience-error': true },
            t('experienceFiles.error')
          )
        : null,
      !state.catalogueConfirmed
        ? el(
            'p',
            { key: 'unknown', role: 'status' },
            t('experienceFiles.unknown')
          )
        : null,
      state.receipt
        ? el(
            'p',
            {
              key: 'receipt',
              role: 'status',
              style: { overflowWrap: 'anywhere' },
              'data-experience-receipt': state.receipt.revision,
            },
            t('experienceFiles.saved', { revision: state.receipt.revision })
          )
        : null,
      state.truncated
        ? el(
            'p',
            { key: 'truncated', className: 'meta' },
            t('experienceFiles.truncated')
          )
        : null,
      el(ExistingHhExport, { key: 'native-hh', state, actions }),
      ...['hh', 'linkedin'].map((platform) =>
        el(SnapshotChoice, { key: platform, platform, state, actions })
      ),
      button(
        'compare',
        t('experienceFiles.compare'),
        () => actions.compare(),
        state.busy || !state.choices.hh || !state.choices.linkedin
      ),
      state.comparison
        ? el(CvExperienceComparison, {
            key: 'comparison',
            comparison: state.comparison.comparison,
          })
        : null,
    ]
  );
};
export const CvExperienceDocuments = ({ api }) => {
  const [state, setState] = useState(null);
  const actions = useRef(null);
  useEffect(() => {
    const current = createExperienceState(api, setState);
    actions.current = current;
    current.reload();
    return () => {
      current.dispose();
    };
  }, [api]);
  return state
    ? el(CvExperienceDocumentsScreen, { state, actions: actions.current })
    : null;
};
