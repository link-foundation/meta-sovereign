import React, { useState } from 'react';
import {
  NativeDates,
  NativeArea,
  NativeIndustries,
} from './cv-workplace-native-choices.mjs';
const el = React.createElement;
const field = (qa, value) =>
  el(
    'div',
    { key: qa, 'data-qa': qa },
    el('span', { 'data-qa': 'trigger-values-wrapper' }, value)
  );

/** Native controlled fields, using only finite synthetic CV content. */
export const NativeCvWorkplace = ({
  job,
  hash,
  otherHash,
  shared = false,
  maxLength = 24000,
  fieldsMode = false,
  membershipMode = false,
}) => {
  const [targetChecked, setTargetChecked] = useState(true);
  const [description, setDescription] = useState(job.description);
  const [company, setCompany] = useState(job.company);
  const [checked, setChecked] = useState(shared);
  const [position, setPosition] = useState(job.position);
  const [website, setWebsite] = useState(job.website);
  const [area, setArea] = useState(job.area);
  const [industryIds, setIndustryIds] = useState(
    job.industries.map((row) => row.id)
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
      onChange: (event) => {
        setCompany(event.target.value);
        if (globalThis.fixtureConcurrentOwner) {
          setPosition('Owner concurrent position');
        }
      },
    }),
    el('input', {
      key: 'position',
      name: 'position',
      value: position,
      readOnly: !fieldsMode,
      onChange: (event) => setPosition(event.target.value),
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
    fieldsMode
      ? el(NativeDates, { key: 'full-dates', job })
      : el(React.Fragment, { key: 'dates' }, [
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
      fieldsMode
        ? el(NativeArea, { key: 'area', value: area, update: setArea })
        : field('resume-editor-experience-area-input', job.area),
      el('input', {
        key: 'website',
        'data-qa': 'resume-editor-experience-company-url-input',
        value: website,
        readOnly: !fieldsMode,
        onChange: (event) => setWebsite(event.target.value),
      }),
      fieldsMode
        ? el(NativeIndustries, {
            key: 'industry',
            values: industryIds,
            update: setIndustryIds,
          })
        : el('div', { key: 'industry', 'data-qa': 'trigger-root' }, [
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
        checked: targetChecked,
        readOnly: !membershipMode,
        onChange: membershipMode
          ? (event) => {
              setTargetChecked(event.target.checked);
              if (globalThis.fixtureMembershipConcurrentOwner) {
                setCompany('Owner revised company');
                setChecked(false);
              }
            }
          : undefined,
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
