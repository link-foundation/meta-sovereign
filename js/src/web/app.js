// meta-sovereign web UI. React owns the shell and every view, while
// ./dom.js keeps the offline-first storage, discovery, WebRTC sync,
// and server fallback contracts stable.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { api } from './dom.js';
import { installClientLog } from './client-log.js';
import { views } from './views.js';
import {
  TutorialButton,
  TutorialOverlay,
  readPreference,
  useTutorialPreference,
} from './tutorial.js';
import { LocaleContext, useLocale } from './i18n.js';
import { LanguageSwitcher } from './language-switcher.js';
import { AppShell } from './shell/app-shell.js';
import { useAppearance, useApplyAppearance } from './appearance.js';
import { useApplyEffects } from './effects.js';
import { WebModeBanner } from './web-mode-banner.js';
import { DiskBanner } from './disk-banner.js';
import { SchemaBanner } from './schema-banner.js';
import { ApiErrorToast } from './api-errors.js';
import { installDialogFocus } from './dialog-focus.js';
import { shouldAutoOpen, useAnyConnection } from './tutorial-start.js';
import { Icon } from './icons.js';
import { ModeBadge } from './telegram-online.js';
import { InviteHost } from './chat-invite.js';
import { LimitHost } from './chat-channel-limit.js';
import { ProxyHost } from './settings-proxy.js';
import { GiftHost } from './chat-gift-unique.js';
import { useApplyUiScale } from './ui-scale.js';
import { AddlistHost } from './chat-folder-share.js';
import { AddthemeHost, useApplyCloudTheme } from './cloud-themes.js';
import { ContactLinkHost } from './contact-links.js';
import { AppNotifications } from './app-notify.js';
import { LockScreen, useLocalLock } from './passcode.js';
import { useAppNavigation } from './app-navigation.js';
import { useNavigationCounts } from './navigation-counts.js';

// Browser e2e tests reach the booted api here: in the bundled build the
// source modules are not each served, so `import('/dom.js')` fails.
globalThis.__msApi = api;

const el = React.createElement;

const useOnlineMode = () => {
  const [online, setOnline] = useState(null);
  useEffect(() => {
    let unsubscribe = null;
    let cancelled = false;
    api.isOnline().then((next) => {
      if (!cancelled) {
        setOnline(next);
      }
    });
    api
      .on((event) => {
        if (event.type === 'mode-change') {
          setOnline(event.online);
        }
      })
      .then((nextUnsubscribe) => {
        unsubscribe = nextUnsubscribe;
      });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);
  return online;
};

const useViewportWidth = () => {
  const initial =
    typeof globalThis.innerWidth === 'number' ? globalThis.innerWidth : 1024;
  const [width, setWidth] = useState(initial);
  useEffect(() => {
    const onResize = () => setWidth(globalThis.innerWidth ?? 1024);
    globalThis.addEventListener?.('resize', onResize);
    return () => globalThis.removeEventListener?.('resize', onResize);
  }, []);
  return width;
};

const ViewNotifications = ({ active, t, onOpen }) =>
  active === 'chat' || active === 'operator'
    ? null
    : el(AppNotifications, { api, t, onOpen });

const App = () => {
  const [route, navigate] = useAppNavigation();
  const active = route.view;
  const counts = useNavigationCounts(api, active);
  const online = useOnlineMode();
  useApplyAppearance();
  // A cloud theme's accent and bubbles on the page (R-Y209).
  useApplyCloudTheme();
  // The interface scale and message text size (R-Y192).
  useApplyUiScale();
  const { theme, toggle } = useAppearance();
  const localeApi = useLocale();
  const { t } = localeApi;
  const tutorial = useTutorialPreference();
  const width = useViewportWidth();
  // The overlay opens by itself for a new user (nothing saved, no
  // service connected) or a tour in progress, and otherwise only from
  // the header button (R-M12) — see ./tutorial-start.js.
  const connected = useAnyConnection(api);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  // Frosted glass and dims off on a slow-rendering browser (R-Z21).
  useApplyEffects(tutorialOpen);
  const decided = useRef(false);
  useEffect(() => {
    if (connected === null || decided.current) {
      return;
    }
    decided.current = true;
    if (shouldAutoOpen(readPreference(globalThis.localStorage), connected)) {
      setTutorialOpen(true);
    }
  }, [connected]);

  const openTutorial = () => {
    tutorial.reopen();
    setTutorialOpen(true);
  };
  const closeTutorial = () => setTutorialOpen(false);
  const View = useMemo(() => views[active] ?? views.chat, [active]);

  return el(LocaleContext.Provider, { value: localeApi }, [
    el(React.Fragment, { key: 'shell' }, [
      el('a', { key: 'skip', className: 'skip-link', href: '#root' }, [
        t('skipLink'),
      ]),
      el(
        'header',
        { key: 'header', className: 'topbar glass', role: 'banner' },
        [
          el('h1', { key: 'brand' }, t('appName')),
          el(ModeBadge, { key: 'mode', online }),
          el(TutorialButton, { key: 'tutorial', onOpen: openTutorial }),
          el(LanguageSwitcher, { key: 'lang' }),
          el(
            'button',
            {
              key: 'theme',
              type: 'button',
              className: 'theme-toggle header-btn',
              'data-action': 'theme-toggle',
              'aria-label': t('header.themeAria'),
              'aria-pressed': String(theme === 'dark'),
              title: t('header.themeAria'),
              onClick: toggle,
            },
            [
              el(Icon, {
                key: 'i',
                name: theme === 'dark' ? 'moon' : 'sun',
                size: 18,
              }),
              el(
                'span',
                { key: 'l', className: 'btn-label' },
                t('header.theme')
              ),
            ]
          ),
        ]
      ),
      el(
        AppShell,
        {
          key: 'shell-nav',
          width,
          active,
          onSelect: (view) => navigate({ view }),
          counts,
        },
        el(
          'main',
          {
            key: 'main',
            id: 'root',
            role: 'main',
            tabIndex: -1,
            'data-view': active,
          },
          [
            el(DiskBanner, { key: 'disk', api }),
            el(SchemaBanner, { key: 'schema', api }),
            el(ApiErrorToast, { key: 'api-error' }),
            el(WebModeBanner, {
              key: 'web-mode',
              online,
              onRetry: () => api.rediscover(),
              findNearby: api.nearby,
            }),
            el(View, { key: 'view' }),
          ]
        )
      ),
      el(InviteHost, { key: 'invite-host', api }),
      el(LimitHost, { key: 'limit-host', api }),
      el(ProxyHost, { key: 'proxy-host', api }),
      // Unique gifts and gift codes, from links and buttons (R-Y193).
      el(GiftHost, { key: 'gift-host', api }),
      el(AddlistHost, { key: 'addlist-host', api }),
      // A t.me/addtheme link's preview (R-Y209).
      el(AddthemeHost, { key: 'addtheme-host', api }),
      // A t.me/contact or t.me/+phone link opens the person (R-Y217).
      el(ContactLinkHost, { key: 'contact-link-host', api }),
      // The Chat section notifies by itself; the others through this.
      el(ViewNotifications, {
        key: 'notify',
        active,
        t,
        onOpen: () => navigate({ view: 'chat' }),
      }),
      el(TutorialOverlay, {
        key: 'tutorial-overlay',
        open: tutorialOpen,
        connected,
        onClose: closeTutorial,
        onDismiss: tutorial.dismiss,
        onComplete: tutorial.complete,
      }),
    ]),
  ]);
};

// The local passcode (R-Y183): while the server is locked the app is not
// shown at all, only the unlock screen.
const Root = () => {
  const localeApi = useLocale();
  const lock = useLocalLock(api);
  return lock.phase === 'locked'
    ? el(LocaleContext.Provider, { value: localeApi }, el(LockScreen, { api }))
    : el(App);
};

const mount = document.getElementById('app');
installClientLog({ send: api.clientLog });
installDialogFocus();
createRoot(mount).render(el(Root));
