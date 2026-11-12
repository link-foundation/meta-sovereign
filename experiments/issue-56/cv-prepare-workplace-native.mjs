import React, { useState } from 'react';
const el = React.createElement;

/** Native controlled fields, using only finite synthetic CV content. */
export const NativeCvWorkplace = ({
  job,
  hash,
  otherHash,
  shared = false,
  maxLength = 24000,
}) => {
  const [description, setDescription] = useState(job.description);
  const [company, setCompany] = useState(job.company);
  const [checked, setChecked] = useState(shared);
  const field = (qa, value) =>
    el(
      'div',
      { key: qa, 'data-qa': qa },
      el('span', { 'data-qa': 'trigger-values-wrapper' }, value)
    );
  const save = async () => {
    globalThis.fixtureSaves++;
    await fetch('/fixture/save', { method: 'POST', body: description });
    globalThis.location.href = `/resume/${hash}`;
  };
  return el('main', null, [
    el('h1', { key: 'title' }, 'Existing workplace · owner Save'),
    el('input', {
      key: 'company',
      name: 'company',
      value: company,
      onChange: (event) => setCompany(event.target.value),
    }),
    el('input', {
      key: 'position',
      name: 'position',
      value: job.position,
      readOnly: true,
    }),
    el('textarea', {
      key: 'description',
      'data-qa': 'resume-editor-experience-description-input',
      maxLength,
      value: description,
      onChange: (event) => {
        globalThis.fixtureInputs++;
        setDescription(event.target.value);
      },
    }),
    el(React.Fragment, { key: 'dates' }, [
      field('resume-editor-experience-start-month-input', 'May'),
      el('input', {
        key: 'year',
        'data-qa': 'resume-editor-experience-start-year-input',
        value: '2020',
        readOnly: true,
      }),
      el('input', {
        key: 'current',
        type: 'checkbox',
        'data-qa': 'resume-editor-experience-present-checkbox',
        checked: true,
        readOnly: true,
      }),
    ]),
    el(React.Fragment, { key: 'metadata' }, [
      field('resume-editor-experience-area-input', job.area),
      el('input', {
        key: 'website',
        'data-qa': 'resume-editor-experience-company-url-input',
        value: job.website,
        readOnly: true,
      }),
      el('div', { key: 'industry', 'data-qa': 'trigger-root' }, [
        el('label', { key: 'label' }, 'Field of activity'),
        el(
          'span',
          { key: 'values', 'data-qa': 'trigger-values-wrapper' },
          job.industries.map((row) => row.name).join(', ')
        ),
      ]),
    ]),
    el('label', { key: 'cv' }, [
      el('input', {
        key: 'checkbox',
        type: 'checkbox',
        'data-qa': `profile-resumes-list-checkbox-${hash}`,
        checked: true,
        readOnly: true,
      }),
      'English CV',
    ]),
    el('label', { key: 'other' }, [
      el('input', {
        key: 'checkbox',
        type: 'checkbox',
        'data-qa': `profile-resumes-list-checkbox-${otherHash}`,
        checked,
        onChange: (event) => setChecked(event.target.checked),
      }),
      'Russian CV',
    ]),
    el(
      'button',
      { key: 'save', 'data-qa': 'profile-layout-save-button', onClick: save },
      'Save workplace'
    ),
    el(
      'button',
      {
        key: 'cancel',
        'data-qa': 'profile-layout-cancel-button',
        onClick: () => {
          globalThis.fixtureCancels++;
        },
      },
      'Cancel'
    ),
  ]);
};
