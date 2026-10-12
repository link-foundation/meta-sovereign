// meta-sovereign web UI. React owns the shell and every view, while
// ./dom.js keeps the offline-first storage, discovery, WebRTC sync,
// and server fallback contracts stable.

import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createRoot } from 'react-dom/client';
import { api } from './dom.js';
import { views } from './views.js';
import {
  TutorialButton,
  TutorialOverlay,
  useTutorialPreference,
} from './tutorial.js';
import { LocaleContext, useLocale } from './i18n.js';
import { LanguageSwitcher } from './language-switcher.js';
import { AppShell } from './shell/app-shell.js';
import { useAppearance, useApplyAppearance } from './appearance.js';
import { WebModeBanner } from './web-mode-banner.js';
import { Icon } from './icons.js';

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

const App = () => {
  const [active, setActive] = useState('chat');
  const online = useOnlineMode();
  useApplyAppearance();
  const { theme, toggle } = useAppearance();
  const localeApi = useLocale();
  const { t } = localeApi;
  const tutorial = useTutorialPreference();
  const width = useViewportWidth();
  // The overlay opens automatically on first run (no stored preference)
  // and otherwise only when the user clicks the header button (R-M12).
  const [tutorialOpen, setTutorialOpen] = useState(() => !tutorial.isOff);

  // Listen for cross-component "switch to view N and scroll to anchor"
  // events fired by the per-section "Connect first" CTAs (R-O7).
  useEffect(() => {
    const onNavigate = (event) => {
      const detail = event.detail ?? {};
      if (typeof detail.view === 'string') {
        setActive(detail.view);
      }
      if (typeof detail.anchor === 'string') {
        // Update the URL hash so the Connections view can open the
        // matching `id="conn-{provider}"` detail on first paint.
        if (globalThis.location) {
          globalThis.location.hash = detail.anchor;
        }
      }
    };
    globalThis.addEventListener('meta-sovereign:navigate', onNavigate);
    return () =>
      globalThis.removeEventListener('meta-sovereign:navigate', onNavigate);
  }, []);
  const openTutorial = () => {
    tutorial.reopen();
    setTutorialOpen(true);
  };
  const closeTutorial = () => setTutorialOpen(false);
  const View = useMemo(() => views[active] ?? views.chat, [active]);
  // Another section starts at its top, not at the old one's scroll.
  const shownView = useRef(active);
  useLayoutEffect(() => {
    if (shownView.current !== active) {
      shownView.current = active;
      globalThis.scrollTo?.(0, 0);
    }
  }, [active]);

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
          el(
            'span',
            {
              key: 'mode',
              className: `mode-badge ${online ? 'online' : 'offline'}`,
            },
            online ? t('header.online') : t('header.offline')
          ),
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
          onSelect: setActive,
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
            el(WebModeBanner, {
              key: 'web-mode',
              online,
              onRetry: () => api.rediscover(),
            }),
            el(View, { key: 'view' }),
          ]
        )
      ),
      el(TutorialOverlay, {
        key: 'tutorial-overlay',
        open: tutorialOpen,
        onClose: closeTutorial,
        onDismiss: tutorial.dismiss,
        onComplete: tutorial.complete,
      }),
    ]),
  ]);
};

const mount = document.getElementById('app');
createRoot(mount).render(el(App));
