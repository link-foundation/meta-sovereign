import React, { useEffect } from 'react';
import { useCvPublicationSource } from './cv-publication-sources.js';

const el = React.createElement;
const publicationState = (receipt) => receipt?.state ?? 'none';
const snapshotContent = (content) =>
  el(
    'pre',
    {
      key: 'content',
      style: {
        whiteSpace: 'pre-wrap',
        overflowWrap: 'anywhere',
        fontFamily: 'inherit',
      },
    },
    content
  );

const sameSavedSnapshot = (receipt, snapshot) =>
  receipt.resumes.length === 1 &&
  receipt.resumes[0] === snapshot?.hash &&
  receipt.files[0].sourceSha256 === snapshot?.sha256 &&
  receipt.files[0].savedAt === snapshot?.savedAt &&
  receipt.exportId === snapshot?.exportId;
const canPublishSnapshot = (state, snapshot, supported) =>
  !state.loadError &&
  supported &&
  state.receipt?.state === 'planned' &&
  state.receipt.repository === state.repository &&
  state.receipt.remote === state.remote &&
  state.receipt.directory === state.directory &&
  sameSavedSnapshot(state.receipt, snapshot) &&
  Date.now() < Date.parse(state.receipt.expiresAt);

export const CvSnapshotPublication = ({
  publication: state,
  snapshot,
  exports,
  browserSlot,
  busy,
  supported,
  t,
}) => {
  const { source, picker } = useCvPublicationSource({
    snapshot,
    exports,
    browserSlot,
    receipt: state.receipt,
    busy,
    t,
  });
  const receipt = state.receipt;
  const phase = publicationState(receipt);
  const chosen = source?.hash;
  const canPublish = canPublishSnapshot(state, source, supported);
  useEffect(() => {
    state.setConsent(false);
  }, [chosen, source?.sha256, source?.savedAt, source?.exportId]);
  return el(
    'section',
    {
      className: 'col',
      'data-cv-publication': true,
      'aria-label': t('cvPublish.title'),
    },
    [
      el('h4', { key: 'title' }, t('cvPublish.title')),
      el('p', { key: 'hint', className: 'meta' }, t('cvPublish.hint')),
      el(React.Fragment, { key: 'source' }, picker),
      ...['repository', 'remote', 'directory'].map((key) =>
        el('label', { key, className: 'chat-form-field' }, [
          el('span', { key: 'label' }, t(`cvPublish.${key}`)),
          el('input', {
            key: 'input',
            value: state[key],
            disabled: busy || !supported,
            onChange: (event) =>
              state[`set${key[0].toUpperCase()}${key.slice(1)}`](
                event.target.value
              ),
            'data-cv-publication-field': key,
          }),
        ])
      ),
      el('div', { key: 'actions', className: 'row' }, [
        el(
          'button',
          {
            key: 'plan',
            type: 'button',
            disabled: busy || !supported || !chosen || !state.repository,
            onClick: () => state.plan(chosen, source?.exportId),
            'data-cv-publication-action': 'plan',
          },
          t('cvPublish.plan')
        ),
        el(
          'button',
          {
            key: 'reload',
            type: 'button',
            disabled: busy,
            onClick: state.reload,
            'data-cv-publication-action': 'reload',
          },
          t('cvPublish.reload')
        ),
      ]),
      el(
        'p',
        {
          key: 'state',
          role: 'status',
          'data-cv-publication-state': phase,
        },
        t(`cvPublish.${phase}`)
      ),
      state.loadError
        ? el('p', { key: 'error', role: 'status' }, t('cvPublish.loadError'))
        : null,
      receipt
        ? el(React.Fragment, { key: 'review' }, [
            el(
              'p',
              {
                key: 'target',
                className: 'meta',
                style: { overflowWrap: 'anywhere' },
              },
              `${receipt.repository} · ${receipt.remote} (${receipt.destination}) · ${receipt.branch} · ${receipt.base}`
            ),
            ...receipt.files.map((file) =>
              el(
                'details',
                { key: file.path, 'data-cv-publication-file': file.path },
                [
                  el(
                    'summary',
                    { key: 'path', style: { overflowWrap: 'anywhere' } },
                    file.path
                  ),
                  snapshotContent(file.content),
                ]
              )
            ),
            receipt.commit
              ? el(
                  'p',
                  {
                    key: 'commit',
                    className: 'meta',
                    style: { overflowWrap: 'anywhere' },
                  },
                  `${t('cvPublish.commit')}: ${receipt.commit}`
                )
              : null,
            el('label', { key: 'consent', className: 'row' }, [
              el('input', {
                key: 'input',
                type: 'checkbox',
                checked: state.consent,
                disabled: busy || !canPublish,
                onChange: (event) => state.setConsent(event.target.checked),
                'data-cv-publication-consent': true,
              }),
              el('span', { key: 'label' }, t('cvPublish.consent')),
            ]),
            el(
              'button',
              {
                key: 'publish',
                type: 'button',
                disabled: busy || !canPublish || !state.consent,
                onClick: state.publish,
                'data-cv-publication-action': 'publish',
              },
              t('cvPublish.publish')
            ),
          ])
        : null,
    ]
  );
};
