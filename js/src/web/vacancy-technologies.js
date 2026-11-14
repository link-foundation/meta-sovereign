import React from 'react';
import { TechnologyCatalogEditor } from './technology-catalog-editor.js';
import { TechnologyAnalysisView } from './technology-analysis-view.js';

const el = React.createElement;
export const VacancyTechnologies = ({ state, t }) => {
  const technology = state.technology;
  const idle = !state.busy;
  const exports = state.resumeExports?.exports ?? [];
  return el(
    'section',
    {
      className: 'col',
      'data-vacancy-technologies': true,
      'aria-label': t('technology.title'),
    },
    [
      el('h3', { key: 'title' }, t('technology.title')),
      el('p', { key: 'hint', className: 'meta' }, t('technology.hint')),
      el(TechnologyCatalogEditor, {
        key: `${state.values.browserSlot}:${technology.catalog?.revision}`,
        state: technology,
        idle,
        t,
      }),
      el('label', { key: 'resume', className: 'chat-form-field' }, [
        el('span', { key: 'label' }, t('technology.resume')),
        el(
          'select',
          {
            key: 'input',
            'data-technology-field': 'resume',
            value: technology.selection,
            disabled: !idle,
            onChange: (event) => technology.setSelection(event.target.value),
          },
          [
            el('option', { key: 'none', value: '' }, t('technology.choose')),
            ...exports.map((row) =>
              el(
                'option',
                { key: row.hash, value: `${row.exportId}:${row.hash}` },
                `${row.title} · ${row.hash} · ${row.language.toUpperCase()}`
              )
            ),
          ]
        ),
      ]),
      el('div', { key: 'actions', className: 'row' }, [
        el(
          'button',
          {
            key: 'analyze',
            type: 'button',
            'data-technology-action': 'analyze',
            disabled:
              !idle ||
              !technology.catalog ||
              technology.dirty ||
              !technology.selection,
            onClick: () => technology.analyze(exports),
          },
          t('technology.analyze')
        ),
        el(
          'button',
          {
            key: 'reload',
            type: 'button',
            'data-technology-action': 'reload',
            disabled: !idle,
            onClick: technology.reload,
          },
          t('technology.reload')
        ),
      ]),
      technology.loadError
        ? el('p', { key: 'error', role: 'status' }, t('technology.loadError'))
        : null,
      technology.analysis
        ? el(TechnologyAnalysisView, {
            key: technology.analysis.fingerprint,
            analysis: technology.analysis,
            catalog: technology.catalog,
            t,
          })
        : null,
    ]
  );
};
