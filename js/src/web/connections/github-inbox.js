// GitHub on the Connections card (R-Z11): choose which repositories to
// pull, say how often, and "Fetch now". Reads and writes go to the local
// server's /api/github/*; the repository list is asked from GitHub only
// when the user opens the picker.

import React, { useEffect, useState } from 'react';
import { api } from '../dom.js';
import { useT } from '../i18n.js';
import { FetchNow } from './fetch-now.js';
import { GithubNotifications } from './github-notifications.js';

const el = React.createElement;

const EVERY = [0, 15, 60, 360, 1440];

const errorText = (t, answer) => {
  const key = `github.inbox.error.${answer.code}`;
  const known = t(key, { seconds: answer.retryAfter ?? 0 });
  return known && known !== key
    ? known
    : t('github.inbox.error.generic', { error: answer.error ?? '' });
};

const useGithubInbox = () => {
  const t = useT();
  const [settings, setSettings] = useState(null);
  const [repos, setRepos] = useState(null);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState({ text: '', bad: false });

  useEffect(() => {
    api.githubInbox('settings').then((answer) => {
      if (answer?.ok) {
        setSettings(answer.settings);
      }
    });
  }, []);

  const say = (text, bad = false) => setMessage({ text, bad });
  const run = async (name, work) => {
    setBusy(name);
    say('');
    try {
      await work();
    } finally {
      setBusy('');
    }
  };
  const answered = (answer, onOk) =>
    answer?.ok ? onOk(answer) : say(errorText(t, answer ?? {}), true);

  const load = () =>
    run('load', async () =>
      answered(await api.githubInbox('repos'), (answer) =>
        setRepos(answer.repos)
      )
    );
  const save = (next = settings) =>
    run('save', async () =>
      answered(await api.githubInbox('settings', next), (answer) => {
        setSettings(answer.settings);
        say(t('github.inbox.saved'));
      })
    );
  return {
    t,
    settings,
    setSettings,
    repos,
    busy,
    message,
    load,
    save,
  };
};

const Check = ({ checked, onChange, label, action }) =>
  el('label', { className: 'row' }, [
    el('input', {
      key: 'i',
      type: 'checkbox',
      checked,
      onChange: (event) => onChange(event.target.checked),
      'data-action': action,
    }),
    el('span', { key: 'l' }, label),
  ]);

const RepoPicker = ({ t, repos, settings, setSettings }) => {
  const [filter, setFilter] = useState('');
  const shown = repos.filter((r) =>
    r.fullName.toLowerCase().includes(filter.trim().toLowerCase())
  );
  const toggle = (name, on) =>
    setSettings({
      ...settings,
      repos: on
        ? [...new Set([...settings.repos, name])]
        : settings.repos.filter((r) => r !== name),
    });
  return el('div', { className: 'col', 'data-role': 'github-repo-picker' }, [
    el('input', {
      key: 'filter',
      type: 'search',
      value: filter,
      placeholder: t('github.inbox.filter'),
      'aria-label': t('github.inbox.filter'),
      onChange: (event) => setFilter(event.target.value),
    }),
    shown.length === 0
      ? el('p', { key: 'none', className: 'meta' }, t('github.inbox.none'))
      : el(
          'ul',
          { key: 'list', className: 'github-repo-list', role: 'list' },
          shown.map((repo) =>
            el(
              'li',
              { key: repo.fullName },
              el(Check, {
                checked: settings.repos.includes(repo.fullName),
                onChange: (on) => toggle(repo.fullName, on),
                label: repo.private
                  ? `${repo.fullName} (${t('github.inbox.private')})`
                  : repo.fullName,
                action: `github-repo:${repo.fullName}`,
              })
            )
          )
        ),
    el(
      'p',
      { key: 'count', className: 'meta' },
      t('github.inbox.selected', { count: settings.repos.length })
    ),
  ]);
};

const Schedule = ({ t, settings, setSettings }) =>
  el('div', { className: 'col' }, [
    el('label', { key: 'every', className: 'row' }, [
      el('span', { key: 'l' }, t('github.inbox.schedule')),
      el(
        'select',
        {
          key: 's',
          value: settings.intervalMinutes,
          'data-action': 'github-interval',
          onChange: (event) =>
            setSettings({
              ...settings,
              intervalMinutes: Number(event.target.value),
            }),
        },
        EVERY.map((minutes) =>
          el(
            'option',
            { key: minutes, value: minutes },
            t(`github.inbox.every.${minutes}`)
          )
        )
      ),
    ]),
    el(Check, {
      key: 'notes',
      checked: settings.notifications,
      onChange: (on) => setSettings({ ...settings, notifications: on }),
      label: t('github.inbox.notifications'),
      action: 'github-notifications',
    }),
    el(Check, {
      key: 'disc',
      checked: settings.discussions,
      onChange: (on) => setSettings({ ...settings, discussions: on }),
      label: t('github.inbox.discussions'),
      action: 'github-discussions',
    }),
  ]);

export const GithubInbox = () => {
  const inbox = useGithubInbox();
  const { t, settings, repos, busy, message } = inbox;
  const button = (key, label, action, onClick, disabled = false) =>
    el(
      'button',
      {
        key,
        type: 'button',
        'data-action': action,
        disabled: disabled || busy !== '',
        'aria-busy': busy === key ? 'true' : undefined,
        onClick,
      },
      label
    );
  return el(
    'section',
    { className: 'col github-inbox', 'data-role': 'github-inbox' },
    [
      el('h4', { key: 'h' }, t('github.inbox.title')),
      el('p', { key: 'hint', className: 'meta' }, t('github.inbox.hint')),
      settings && repos ? el(RepoPicker, { key: 'picker', ...inbox }) : null,
      settings ? el(Schedule, { key: 'schedule', ...inbox }) : null,
      el('div', { key: 'buttons', className: 'row' }, [
        button(
          'load',
          busy === 'load' ? t('github.inbox.loading') : t('github.inbox.load'),
          'github-load-repos',
          inbox.load
        ),
        button(
          'save',
          t('github.inbox.save'),
          'github-save-settings',
          () => inbox.save(),
          !settings
        ),
        el(FetchNow, {
          key: 'fetch',
          providerId: 'github',
          disabled: !settings || settings.repos.length === 0 || busy !== '',
          // The fetch reads the saved choice, so the page saves it first.
          before: () => api.githubInbox('settings', settings),
        }),
      ]),
      settings?.notifications
        ? el(GithubNotifications, { key: 'notifications' })
        : null,
      el(
        'p',
        {
          key: 'message',
          className: 'meta',
          role: message.bad ? 'alert' : 'status',
          'data-role': 'github-inbox-message',
        },
        message.text
      ),
    ]
  );
};
