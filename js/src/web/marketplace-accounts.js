import React, { useCallback, useEffect, useState } from 'react';
import { api as defaultApi } from './dom.js';
import { useDates, useT } from './i18n.js';
import { MARKETPLACES } from '../marketplaces/catalogue.js';
import { Busy } from './spinner.js';

const el = React.createElement;

const useAccounts = (api) => {
  const [state, setState] = useState({
    loading: true,
    accounts: [],
    error: null,
  });
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((n) => n + 1), []);
  useEffect(() => {
    let live = true;
    Promise.resolve()
      .then(() => api.marketplaces())
      .then(
        (result) => {
          if (live) {
            setState({
              loading: false,
              accounts: Array.isArray(result?.accounts) ? result.accounts : [],
              error: result?.ok ? null : 'server-required',
            });
          }
        },
        () =>
          live &&
          setState((before) => ({
            ...before,
            loading: false,
            error: 'server-required',
          }))
      );
    return () => {
      live = false;
    };
  }, [api, revision]);
  const watching = state.accounts.some(
    (account) => account.open || account.opening
  );
  useEffect(() => {
    const timer = watching ? globalThis.setInterval(refresh, 2000) : null;
    globalThis.addEventListener?.('focus', refresh);
    return () => {
      globalThis.clearInterval(timer);
      globalThis.removeEventListener?.('focus', refresh);
    };
  }, [watching, refresh]);
  return { state, refresh };
};

const ERROR_KEYS = {
  'needs-profile': 'marketplace.needsProfile',
  'session-closed': 'marketplace.sessionClosed',
  'page-changed': 'marketplace.pageChanged',
  'browser-unavailable': 'marketplace.browserUnavailable',
  'server-required': 'marketplace.serverRequired',
};

const sessionText = (t, loading, account) =>
  t(
    loading
      ? 'common.loading'
      : account?.open
        ? 'marketplace.windowOpen'
        : 'marketplace.windowClosed'
  );

const ProfileSnapshot = ({ profile }) => {
  const t = useT();
  const { dateTime } = useDates();
  if (!profile) {
    return el('p', { className: 'meta' }, t('marketplace.noProfile'));
  }
  return el(
    'div',
    { className: 'marketplace-snapshot', 'data-saved-profile': 'true' },
    [
      el('h4', { key: 'name' }, profile.name),
      profile.headline ? el('p', { key: 'headline' }, profile.headline) : null,
      profile.bio
        ? el('p', { key: 'bio', className: 'marketplace-bio' }, profile.bio)
        : null,
      profile.skills?.length
        ? el(
            'p',
            { key: 'skills', className: 'meta' },
            profile.skills.join(' · ')
          )
        : null,
      el(
        'a',
        {
          key: 'url',
          href: profile.url,
          target: '_blank',
          rel: 'noopener noreferrer',
        },
        t('marketplace.viewProfile')
      ),
      el(
        'p',
        { key: 'captured', className: 'meta' },
        t('marketplace.captured', { at: dateTime(profile.capturedAt) })
      ),
      profile.signInObservedAt
        ? el(
            'p',
            { key: 'observed', className: 'meta' },
            t('marketplace.signInObserved', {
              at: dateTime(profile.signInObservedAt),
            })
          )
        : null,
    ]
  );
};

const AccountCard = ({
  api,
  providerId,
  account,
  refresh,
  unavailable,
  loading,
}) => {
  const t = useT();
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const provider = MARKETPLACES[providerId];
  const act = async (action) => {
    if (busy) {
      return;
    }
    setBusy(action);
    setError(null);
    try {
      const result = await api.marketplaceAction(providerId, action);
      if (!result?.ok) {
        setError(t(ERROR_KEYS[result?.code] ?? 'marketplace.failed'));
      }
      await refresh();
    } catch {
      setError(t('marketplace.failed'));
    } finally {
      setBusy(null);
    }
  };
  const button = (action, label, disabled = false) =>
    el(
      'button',
      {
        key: action,
        type: 'button',
        'data-action': `marketplace-${action}`,
        onClick: () => act(action),
        disabled: unavailable || loading || Boolean(busy) || disabled,
        'aria-busy': busy === action,
      },
      label
    );
  return el(
    'article',
    {
      className: 'card marketplace-account',
      'data-marketplace-id': providerId,
    },
    [
      el('h3', { key: 'h' }, provider.label),
      el(
        'p',
        {
          key: 'state',
          className: 'meta',
          role: 'status',
          'data-session-open': Boolean(account?.open),
        },
        sessionText(t, loading, account)
      ),
      el(ProfileSnapshot, { key: 'profile', profile: account?.profile }),
      el('div', { key: 'controls', className: 'row' }, [
        button(
          'open',
          t(account?.open ? 'marketplace.show' : 'marketplace.open'),
          Boolean(account?.opening)
        ),
        button('profile', t('marketplace.capture'), !account?.open),
        account?.open ? button('close', t('marketplace.close')) : null,
      ]),
      account?.open
        ? el(
            'p',
            { key: 'instructions', className: 'meta' },
            t('marketplace.instructions')
          )
        : null,
      busy ? el(Busy, { key: 'busy' }, t('marketplace.working')) : null,
      error
        ? el(
            'p',
            { key: 'error', role: 'alert', className: 'comments-failed' },
            error
          )
        : null,
      el(
        'a',
        {
          key: 'help',
          className: 'meta',
          href: provider.docsUrl,
          target: '_blank',
          rel: 'noopener noreferrer',
        },
        t('marketplace.help')
      ),
    ]
  );
};

export const MarketplaceAccounts = ({ api = defaultApi, onProfiles }) => {
  const t = useT();
  const { state, refresh } = useAccounts(api);
  useEffect(() => {
    onProfiles?.(state.accounts.filter((account) => account.profile).length);
  }, [state.accounts, onProfiles]);
  return el(
    'section',
    {
      className: 'marketplace-accounts',
      'aria-labelledby': 'marketplace-accounts-title',
    },
    [
      el(
        'h2',
        { key: 'h', id: 'marketplace-accounts-title' },
        t('marketplace.title')
      ),
      el('p', { key: 'intro', className: 'meta' }, t('marketplace.intro')),
      state.error
        ? el(
            'p',
            { key: 'server', className: 'meta', role: 'status' },
            t('marketplace.serverRequired')
          )
        : null,
      state.error
        ? el(
            'button',
            {
              key: 'retry',
              type: 'button',
              'data-action': 'marketplaces-retry',
              onClick: refresh,
            },
            t('webMode.retry')
          )
        : null,
      el(
        'div',
        { key: 'grid', className: 'marketplace-grid' },
        Object.keys(MARKETPLACES).map((id) =>
          el(AccountCard, {
            key: id,
            api,
            providerId: id,
            account: state.accounts.find((account) => account.id === id),
            refresh,
            unavailable: Boolean(state.error),
            loading: state.loading,
          })
        )
      ),
    ]
  );
};
