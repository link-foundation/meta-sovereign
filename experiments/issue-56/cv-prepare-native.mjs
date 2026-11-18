import React, { useState } from 'react';

const el = React.createElement;
/** Real SSR/hydrated React fixture; never an authenticated provider account. */
export const NativeCvAbout = ({
  about,
  initialOpen = false,
  maxLength = 24000,
  stealFocus = false,
}) => {
  const [open, setOpen] = useState(initialOpen);
  const [value, setValue] = useState(about);
  return el('main', null, [
    el('h1', { key: 'title' }, 'Native About editor fixture'),
    el(
      'p',
      { key: 'note' },
      'Review this draft. Only the owner chooses Save or Cancel.'
    ),
    el(
      'form',
      { key: 'search' },
      el('input', { 'aria-label': 'Header search', placeholder: 'Search' })
    ),
    open
      ? el(
          'form',
          { key: 'editor', onSubmit: (event) => event.preventDefault() },
          [
            el('textarea', {
              key: 'about',
              'data-qa': 'resume-editor-about',
              'aria-label': 'About me',
              maxLength,
              value,
              onChange: (event) => {
                globalThis.fixtureInputs++;
                setValue(event.target.value);
                if (stealFocus && event.target.value !== about) {
                  globalThis.document
                    .querySelector('[aria-label="Header search"]')
                    .focus();
                }
              },
            }),
            el(
              'button',
              {
                key: 'save',
                type: 'button',
                'data-qa': 'resume-partial-edit-save',
                onClick: () => {
                  globalThis.fixtureSaves++;
                  globalThis.fixtureSavedAbout = value;
                  setOpen(false);
                },
              },
              'Save'
            ),
            el(
              'button',
              {
                key: 'cancel',
                type: 'button',
                'data-qa': 'resume-partial-edit-cancel',
                onClick: () => {
                  globalThis.fixtureCancels++;
                  setOpen(false);
                },
              },
              'Cancel'
            ),
          ]
        )
      : el(
          'button',
          {
            key: 'open',
            type: 'button',
            'data-qa': 'resume-edit-button-about',
            onClick: () => {
              globalThis.fixtureOpeners++;
              setOpen(true);
            },
          },
          'Edit About'
        ),
  ]);
};
