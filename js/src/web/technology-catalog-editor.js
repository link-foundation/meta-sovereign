import React, { useState } from 'react';
import { technologyCatalogEntries } from '../jobs/technology-catalog.js';

const el = React.createElement;
const field = (t, key, value, update, multiline = false) =>
  el('label', { key, className: 'chat-form-field' }, [
    el('span', { key: 'label' }, t(`technology.${key}`)),
    el(multiline ? 'textarea' : 'input', {
      key: 'input',
      'data-technology-field': key,
      value,
      onChange: (event) => update(event.target.value),
      maxLength: multiline ? 650 : 80,
    }),
  ]);

export const TechnologyCatalogEditor = ({ state, idle, t }) => {
  const [index, setIndex] = useState('');
  const [canonical, setCanonical] = useState('');
  const [aliases, setAliases] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const edit = (value) => {
    setIndex(value);
    const row = state.draft[Number(value)];
    setCanonical(value === '' ? '' : row.canonical);
    setAliases(value === '' ? '' : row.aliases.join('\n'));
    setCaseSensitive(value === '' ? false : row.caseSensitive);
    setInvalid(false);
  };
  const apply = () => {
    try {
      const row = {
        canonical,
        aliases: aliases
          .split('\n')
          .map((name) => name.trim())
          .filter(Boolean),
        caseSensitive,
      };
      state.setDraft(
        technologyCatalogEntries([
          ...state.draft.filter((_, i) => index === '' || i !== Number(index)),
          row,
        ])
      );
      edit('');
    } catch {
      setInvalid(true);
    }
  };
  return el('details', { 'data-technology-catalog': true }, [
    el('summary', { key: 'summary' }, t('technology.catalog')),
    el(
      'fieldset',
      {
        key: 'editor',
        disabled: !idle || !state.catalog,
        className: 'automation-fieldset',
      },
      [
        el('legend', { key: 'legend' }, t('technology.catalogEdit')),
        el('label', { key: 'select', className: 'chat-form-field' }, [
          el('span', { key: 'label' }, t('technology.entry')),
          el(
            'select',
            {
              key: 'input',
              'data-technology-field': 'entry',
              value: index,
              onChange: (event) => edit(event.target.value),
            },
            [
              el('option', { key: 'new', value: '' }, t('technology.new')),
              ...state.draft.map((row, i) =>
                el(
                  'option',
                  { key: row.canonical, value: String(i) },
                  row.canonical
                )
              ),
            ]
          ),
        ]),
        field(t, 'canonical', canonical, setCanonical),
        field(t, 'aliases', aliases, setAliases, true),
        el('label', { key: 'case', className: 'check' }, [
          el('input', {
            key: 'input',
            type: 'checkbox',
            'data-technology-field': 'caseSensitive',
            checked: caseSensitive,
            onChange: (event) => setCaseSensitive(event.target.checked),
          }),
          t('technology.caseSensitive'),
        ]),
        el('div', { key: 'actions', className: 'row' }, [
          el(
            'button',
            {
              key: 'apply',
              type: 'button',
              'data-technology-action': 'entry-save',
              onClick: apply,
            },
            t('technology.updateDraft')
          ),
          el(
            'button',
            {
              key: 'remove',
              type: 'button',
              'data-technology-action': 'entry-remove',
              disabled: index === '',
              onClick: () => {
                state.setDraft(
                  state.draft.filter((_, i) => i !== Number(index))
                );
                edit('');
              },
            },
            t('technology.remove')
          ),
          el(
            'button',
            {
              key: 'defaults',
              type: 'button',
              'data-technology-action': 'defaults',
              onClick: () => {
                state.defaults();
                edit('');
              },
            },
            t('technology.defaults')
          ),
          el(
            'button',
            {
              key: 'save',
              type: 'button',
              'data-technology-action': 'catalog-save',
              disabled: !state.dirty,
              onClick: state.save,
            },
            t('technology.save')
          ),
        ]),
        state.dirty
          ? el('p', { key: 'dirty', role: 'status' }, t('technology.unsaved'))
          : null,
        invalid
          ? el('p', { key: 'invalid', role: 'alert' }, t('technology.invalid'))
          : null,
      ]
    ),
  ]);
};
