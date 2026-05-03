// meta-sovereign web UI. React owns the shell and every view, while
// ./dom.js keeps the offline-first storage, discovery, WebRTC sync,
// and server fallback contracts stable.

import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { api } from './dom.js';
import { navItems, views } from './views.js';
import {
  TutorialButton,
  TutorialOverlay,
  useTutorialPreference,
} from './tutorial.js';

const el = React.createElement;
const THEME_KEY = 'metaSovereignTheme';

const initialTheme = () => {
  try {
    const stored = globalThis.localStorage?.getItem(THEME_KEY);
    if (stored === 'dark' || stored === 'light') {
      return stored;
    }
  } catch {
    // Storage can be disabled in restricted browser contexts.
  }
  return '';
};

const applyTheme = (mode) => {
  if (mode === 'light' || mode === 'dark') {
    document.documentElement.dataset.theme = mode;
  } else {
    delete document.documentElement.dataset.theme;
  }
};

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

const useTheme = () => {
  const [theme, setTheme] = useState(initialTheme);
  useEffect(() => {
    applyTheme(theme);
    try {
      if (theme) {
        globalThis.localStorage?.setItem(THEME_KEY, theme);
      }
    } catch {
      // See initialTheme().
    }
  }, [theme]);
  const toggle = () => {
    const current =
      theme ||
      (globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light');
    setTheme(current === 'dark' ? 'light' : 'dark');
  };
  return { theme, toggle };
};

const App = () => {
  const [active, setActive] = useState('chat');
  const online = useOnlineMode();
  const { theme, toggle } = useTheme();
  const tutorial = useTutorialPreference();
  // The overlay opens automatically on first run (no stored preference)
  // and otherwise only when the user clicks the header button (R-M12).
  const [tutorialOpen, setTutorialOpen] = useState(() => !tutorial.isOff);
  const openTutorial = () => {
    tutorial.reopen();
    setTutorialOpen(true);
  };
  const closeTutorial = () => setTutorialOpen(false);
  const View = useMemo(() => views[active] ?? views.chat, [active]);

  return el(React.Fragment, {}, [
    el('a', { key: 'skip', className: 'skip-link', href: '#root' }, [
      'Skip to main content',
    ]),
    el('header', { key: 'header', className: 'topbar', role: 'banner' }, [
      el('h1', { key: 'brand' }, 'meta-sovereign'),
      el(
        'nav',
        { key: 'nav', 'aria-label': 'Primary' },
        navItems.map(([id, label]) =>
          el(
            'button',
            {
              key: id,
              type: 'button',
              'data-view': id,
              className: id === active ? 'active' : '',
              onClick: () => setActive(id),
            },
            label
          )
        )
      ),
      el(
        'span',
        {
          key: 'mode',
          className: `mode-badge ${online ? 'online' : 'offline'}`,
        },
        online ? 'online' : 'offline'
      ),
      el(TutorialButton, { key: 'tutorial', onOpen: openTutorial }),
      el(
        'button',
        {
          key: 'theme',
          type: 'button',
          className: 'theme-toggle',
          'data-action': 'theme-toggle',
          'aria-label': 'Toggle dark mode',
          'aria-pressed': String((theme || '') === 'dark'),
          title: 'Toggle dark mode',
          onClick: toggle,
        },
        'Theme'
      ),
    ]),
    el(
      'main',
      { key: 'main', id: 'root', role: 'main', tabIndex: -1 },
      el(View)
    ),
    el(TutorialOverlay, {
      key: 'tutorial-overlay',
      open: tutorialOpen,
      onClose: closeTutorial,
      onDismiss: tutorial.dismiss,
    }),
  ]);
};

const mount = document.getElementById('app');
createRoot(mount).render(el(App));
