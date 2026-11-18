import React, { useEffect, useState } from 'react';
import { useT } from './i18n.js';
import { BROADCAST_MODES } from '../broadcast/targets.js';
import { field, choice, toggle, action } from './publication-fields.js';
import { publicationRead } from './publication-state.js';
import { createRetryingRead } from './read-retry.js';
const h = React.createElement;
const kinds = {
  telegram: ['channel', 'group'],
  vk: ['personal-wall', 'community-wall'],
  x: ['account'],
};
const emptyTarget = (network = 'telegram') => ({
  id: '',
  label: '',
  network,
  kind: kinds[network][0],
  destination: '',
  authMode: BROADCAST_MODES[network][0],
  format: 'plain',
  enabled: true,
});
const credentialKeys = {
  telegram: ['botToken'],
  vk: ['userToken', 'communityToken'],
  x: [
    'apiKey',
    'apiKeySecret',
    'accessToken',
    'accessTokenSecret',
    'bearerToken',
  ],
};

const CredentialSettings = ({ api, perform, busy }) => {
  const t = useT();
  const [network, setNetwork] = useState('telegram');
  const [presence, setPresence] = useState(null);
  const [values, setValues] = useState({});
  const [revision, refresh] = useState(0);
  useEffect(() => {
    setPresence(null);
    setValues({});
    const read = createRetryingRead(
      async () => publicationRead(await api.credentials(network)),
      { accept: (result) => setPresence(result.fields), failed: () => {} }
    );
    read.refresh();
    return read.stop;
  }, [api, network, revision]);
  const save = () =>
    perform(async () => {
      const entered = Object.fromEntries(
        Object.entries(values).filter(([, value]) => value.trim())
      );
      publicationRead(await api.saveCredentials(network, entered));
      setValues({});
      refresh((n) => n + 1);
      return t('publication.credentialsSaved');
    });
  return h(
    'fieldset',
    { className: 'publication-credentials', disabled: busy },
    [
      h('legend', { key: 'legend' }, t('publication.credentials')),
      h('p', { key: 'hint' }, t('publication.credentialsHint')),
      choice(
        t,
        'credentialNetwork',
        network,
        setNetwork,
        Object.keys(credentialKeys)
      ),
      ...credentialKeys[network].map((key) =>
        h('div', { key }, [
          field(
            t,
            key,
            values[key] ?? '',
            (value) => setValues((before) => ({ ...before, [key]: value })),
            { type: 'password', autoComplete: 'new-password', maxLength: 8192 }
          ),
          h(
            'small',
            { key: 'present' },
            t(
              presence === null
                ? 'common.loading'
                : presence[key]
                  ? 'publication.present'
                  : 'publication.missing'
            )
          ),
          action(
            t('publication.clearSaved', { field: t(`publication.${key}`) }),
            () =>
              perform(async () => {
                publicationRead(
                  await api.saveCredentials(network, { [key]: '' })
                );
                refresh((n) => n + 1);
                return t('publication.credentialsSaved');
              }),
            busy || presence === null,
            { key: 'clear' }
          ),
        ])
      ),
      action(
        t('common.save'),
        save,
        busy || !Object.values(values).some((v) => v.trim()),
        { key: 'save' }
      ),
      h(
        'a',
        { key: 'login', href: '#conn-telegram/manual' },
        t('publication.telegramLogin')
      ),
    ]
  );
};

export const PublicationSettings = ({
  api,
  targets,
  reload,
  perform,
  busy,
}) => {
  const t = useT();
  const [draft, setDraft] = useState(emptyTarget);
  const patch = (key, value) =>
    setDraft((before) => ({ ...before, [key]: value }));
  const save = (event) => {
    event.preventDefault();
    return perform(async () => {
      publicationRead(await api.saveTarget(draft));
      setDraft(emptyTarget());
      reload();
      return t('publication.destinationSaved');
    });
  };
  return h('div', { className: 'publication-settings' }, [
    h(
      'ul',
      { key: 'targets', className: 'publication-targets' },
      targets.map((target) =>
        h('li', { key: target.id }, [
          h(
            'span',
            { key: 'name' },
            `${target.label} · ${target.network} · ${target.destination || t('publication.authenticatedAccount')}`
          ),
          action(t('publication.edit'), () => setDraft(target), busy, {
            key: 'edit',
          }),
          action(
            t('publication.remove'),
            () =>
              perform(async () => {
                publicationRead(await api.removeTarget(target.id));
                reload();
                return t('publication.destinationRemoved');
              }),
            busy,
            { key: 'remove' }
          ),
        ])
      )
    ),
    h(
      'form',
      { key: 'form', onSubmit: save, className: 'publication-form' },
      h('fieldset', { disabled: busy, className: 'publication-form-fields' }, [
        h('h4', { key: 'title' }, t('publication.destinationEditor')),
        field(
          t,
          'id',
          draft.id.replace(/^broadcast-target:/, ''),
          (v) => patch('id', v),
          { required: true, pattern: '[a-zA-Z0-9_-]{1,80}', maxLength: 80 }
        ),
        field(t, 'label', draft.label, (v) => patch('label', v), {
          required: true,
          maxLength: 120,
        }),
        choice(
          t,
          'network',
          draft.network,
          (v) =>
            setDraft({ ...emptyTarget(v), id: draft.id, label: draft.label }),
          Object.keys(kinds)
        ),
        choice(
          t,
          'kind',
          draft.kind,
          (v) =>
            setDraft((before) => ({
              ...before,
              kind: v,
              fromGroup: v === 'community-wall',
              signed: false,
            })),
          kinds[draft.network]
        ),
        draft.network !== 'x' &&
          field(
            t,
            'destination',
            draft.destination,
            (v) => patch('destination', v),
            { required: true }
          ),
        choice(
          t,
          'authMode',
          draft.authMode,
          (v) => patch('authMode', v),
          BROADCAST_MODES[draft.network]
        ),
        draft.network === 'telegram' &&
          choice(t, 'format', draft.format, (v) => patch('format', v), [
            'plain',
            'html',
          ]),
        draft.kind === 'community-wall' &&
          toggle(t, 'fromGroup', draft.fromGroup ?? true, (v) =>
            patch('fromGroup', v)
          ),
        draft.kind === 'community-wall' &&
          toggle(t, 'signed', draft.signed ?? false, (v) => patch('signed', v)),
        toggle(t, 'enabled', draft.enabled, (v) => patch('enabled', v)),
        h('div', { key: 'actions', className: 'row' }, [
          h(
            'button',
            { key: 'save', type: 'submit', disabled: busy },
            t('common.save')
          ),
          action(t('common.cancel'), () => setDraft(emptyTarget()), busy, {
            key: 'cancel',
          }),
        ]),
      ])
    ),
    h(CredentialSettings, { key: 'credentials', api, perform, busy }),
  ]);
};
