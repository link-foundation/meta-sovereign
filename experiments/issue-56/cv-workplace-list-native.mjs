import React, { useState } from 'react';
import { NativeCvWorkplace } from './cv-prepare-workplace-native.mjs';
const el = React.createElement;

/** Native list includes older jobs omitted from the compact CV overview. */
export const NativeCvWorkplaceList = ({
  job,
  hash,
  otherHash,
  screen,
  list = {},
  captureSave,
}) => {
  const [adding, setAdding] = useState(false);
  if (adding) {
    return el(NativeCvWorkplace, {
      job: {
        company: '',
        position: '',
        description: '',
        website: '',
        area: '',
        start: '',
        end: '',
        current: false,
        industries: [],
      },
      hash,
      otherHash,
      fieldsMode: true,
      membershipMode: true,
      newWorkplace: true,
      shared: list.newShared,
      target: list.newTarget,
      captureSave,
    });
  }
  const jobs = [
    {
      company: 'Current Company',
      position: 'Current Role',
      description: 'Recent work',
      id: '900',
    },
    {
      company: 'Second Company',
      position: 'Second Role',
      description: 'Second recent job',
      id: '800',
    },
    ...(screen === 'overview' ? [] : [{ ...job, id: '123' }]),
    ...(list.duplicate ? [{ ...job, id: '456' }] : []),
  ];
  const open = (id) => {
    globalThis.sessionStorage.fixtureListClicks = String(
      Number(globalThis.sessionStorage.fixtureListClicks ?? 0) + 1
    );
    globalThis.location.href = `/profile/edit/experience/${list.wrongRecord ? '456' : id}?resumeFrom=${hash}&hhtmFrom=resume`;
  };
  return el('main', null, [
    el(
      'h1',
      { key: 'title' },
      screen === 'overview'
        ? 'Compact CV overview · recent jobs only'
        : 'Complete workplace list · all jobs'
    ),
    ...(screen === 'list' && list.allowAdd
      ? Array.from({ length: list.duplicateAdd ? 2 : 1 }, (_, index) =>
          el(
            'button',
            {
              key: `add-${index}`,
              'data-qa': 'list-add',
              onClick: () => {
                globalThis.sessionStorage.fixtureListClicks = String(
                  Number(globalThis.sessionStorage.fixtureListClicks ?? 0) + 1
                );
                setAdding(true);
              },
            },
            'Add new workplace'
          )
        )
      : []),
    ...jobs.map((entry, index) =>
      el(
        'article',
        {
          key: `${entry.id}-${index}`,
          'data-qa': 'profile-experience-company-card',
          hidden: list.hidden && entry.id === '123',
        },
        [
          el('h2', { key: 'company' }, entry.company),
          el('p', { key: 'position' }, entry.position),
          el(
            'p',
            { key: 'description', style: { whiteSpace: 'pre-wrap' } },
            entry.description
          ),
          el(
            'button',
            {
              key: 'edit',
              'data-qa': `edit-experience-button-${entry.id}`,
              onClick: () => open(entry.id),
            },
            'Edit workplace'
          ),
        ]
      )
    ),
    list.draft
      ? el('textarea', {
          key: 'draft',
          'data-qa': 'resume-editor-about',
          defaultValue: 'Owner unfinished About draft',
        })
      : null,
    list.challenge ? el('input', { key: 'captcha', name: 'captcha' }) : null,
  ]);
};
