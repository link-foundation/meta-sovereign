import React from 'react';
import { useT } from './i18n.js';
import { ProfileValues } from './question-profile-values.js';

const el = React.createElement;
const blank = () => ({ id: '', name: '', values: {} });

const SharedProfileEditor = ({ draft, set, busy, save, remove }) => {
  const t = useT();
  return el(
    'fieldset',
    { disabled: busy, className: 'col', 'data-shared-profile-editor': true },
    [
      ...['id', 'name'].map((key) =>
        el('label', { key, className: 'field' }, [
          el('span', { key: 'label' }, t(`questions.shared.${key}`)),
          el('input', {
            key: 'input',
            value: draft[key],
            maxLength: key === 'id' ? 75 : 120,
            'aria-label': t(`questions.shared.${key}`),
            disabled: key === 'id' && Boolean(draft.revision),
            onChange: (event) => set({ ...draft, [key]: event.target.value }),
          }),
        ])
      ),
      el(ProfileValues, {
        key: 'values',
        profile: draft.values,
        set: (values) => set({ ...draft, values }),
      }),
      draft.revision
        ? el(
            'small',
            {
              key: 'version',
              className: 'meta',
              style: { overflowWrap: 'anywhere' },
            },
            `${draft.id} · ${draft.updatedAt} · ${draft.revision}`
          )
        : null,
      el('div', { key: 'actions', className: 'row' }, [
        el(
          'button',
          {
            key: 'save',
            type: 'button',
            disabled: !draft.id.trim() || !draft.name.trim(),
            onClick: save,
          },
          t('questions.sharedSave')
        ),
        draft.revision
          ? el(
              'button',
              { key: 'delete', type: 'button', onClick: remove },
              t('questions.sharedDelete')
            )
          : null,
      ]),
    ]
  );
};

export const SharedProfile = ({ api, profileId, setProfileId, disabled }) => {
  const t = useT();
  const [profiles, setProfiles] = React.useState([]);
  const [draft, setDraft] = React.useState(blank);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [notice, setNotice] = React.useState('');
  const active = React.useRef(false);
  const current = React.useRef(profileId);
  current.current = profileId;
  const run = async (work) => {
    if (active.current) {
      return;
    }
    active.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await work();
    } catch (err) {
      setError(err.message);
    } finally {
      active.current = false;
      setBusy(false);
    }
  };
  const load = (id) =>
    run(async () => {
      const before = profileId;
      const result = id
        ? await api.readAnswerProfile(id)
        : { profile: blank() };
      if (current.current !== before) {
        throw new Error(t('questions.sharedChanged'));
      }
      setDraft(result.profile);
      setProfileId(id);
    });
  const save = () =>
    run(async () => {
      const before = profileId;
      const { profile } = await api.saveAnswerProfile(draft);
      if (current.current === before) {
        setDraft(profile);
        setProfileId(profile.id);
      }
      setProfiles((entries) => [
        ...entries.filter((entry) => entry.id !== profile.id),
        profile,
      ]);
      setNotice(t('questions.sharedSaved'));
    });
  const remove = () =>
    run(async () => {
      await api.deleteAnswerProfile({ id: draft.id, revision: draft.revision });
      setProfiles((entries) =>
        entries.filter((entry) => entry.id !== draft.id)
      );
      setDraft(blank());
      setNotice(t('questions.sharedDeleted'));
    });
  const known = profiles.some((entry) => entry.id === profileId);
  return el('details', { 'data-shared-profile': true }, [
    el('summary', { key: 'summary' }, t('questions.sharedProfiles')),
    el('p', { key: 'hint', className: 'meta' }, t('questions.sharedHint')),
    error ? el('p', { key: 'error', role: 'alert' }, error) : null,
    notice ? el('p', { key: 'notice', role: 'status' }, notice) : null,
    busy ? el('p', { key: 'busy', role: 'status' }, t('common.loading')) : null,
    el(
      'fieldset',
      { key: 'selection', disabled: busy || disabled, className: 'col' },
      [
        el(
          'button',
          {
            key: 'reload',
            type: 'button',
            onClick: () =>
              run(async () => {
                setProfiles(await api.answerProfiles());
                setNotice(t('questions.sharedLoaded'));
              }),
          },
          t('questions.sharedLoad')
        ),
        el('label', { key: 'profile', className: 'field' }, [
          el('span', { key: 'label' }, t('questions.sharedSelect')),
          el(
            'select',
            {
              key: 'select',
              value: profileId,
              'aria-label': t('questions.sharedSelect'),
              onChange: (event) => load(event.target.value),
            },
            [
              el(
                'option',
                { key: 'none', value: '' },
                t('questions.sharedNone')
              ),
              profileId && !known
                ? el('option', { key: 'current', value: profileId }, profileId)
                : null,
              ...profiles.map((entry) =>
                el('option', { key: entry.id, value: entry.id }, entry.name)
              ),
            ]
          ),
        ]),
        profileId
          ? el(
              'button',
              { key: 'read', type: 'button', onClick: () => load(profileId) },
              t('questions.sharedRead')
            )
          : null,
        el(
          'button',
          {
            key: 'new',
            type: 'button',
            onClick: () => {
              setDraft(blank());
              setProfileId('');
              setError('');
              setNotice('');
            },
          },
          t('questions.sharedNew')
        ),
      ]
    ),
    el(SharedProfileEditor, {
      key: 'editor',
      draft,
      set: setDraft,
      busy: busy || disabled,
      save,
      remove,
    }),
  ]);
};
