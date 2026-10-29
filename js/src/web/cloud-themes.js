import { getLocalStorage } from '../storage/local-storage.js';

// Cloud themes (R-Y209; learned, never copied), as Telegram Desktop's
// Settings → Chat Settings lists them:
// - the user's themes and Telegram's are cards drawn from their colours
//   (accent, outgoing bubble, light or dark ground), not from the
//   .tdesktop-theme file; "Apply" maps the colours onto the app's CSS
//   tokens (accent, outgoing bubble, light or dark mode) and keeps the
//   choice in this browser; the account is also told (account.installTheme,
//   as Desktop records it), best effort; "Back to default" restores;
// - a t.me/addtheme/<slug> link in a message opens a preview with Apply.
// Making or uploading themes is not here.

import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { useT } from './i18n.js';
import { Frame } from './chat-readers.js';
import { currentMode, setThemeMode, useAppearance } from './appearance.js';
import {
  CLOUD_THEME_KEY,
  CLOUD_VARS,
  addthemeSlugOf,
  applicable,
  cardLook,
  cleanChoice,
  cleanTheme,
  cloudVars,
  modeOf,
} from './cloud-theme-model.js';

const el = React.createElement;

const read = () => {
  try {
    const raw = getLocalStorage()?.getItem(CLOUD_THEME_KEY);
    return raw ? cleanChoice(JSON.parse(raw)) : null;
  } catch {
    // Storage can be disabled, or hold something that is not ours.
    return null;
  }
};

const write = (choice) => {
  try {
    if (choice) {
      getLocalStorage()?.setItem(CLOUD_THEME_KEY, JSON.stringify(choice));
    } else {
      getLocalStorage()?.removeItem(CLOUD_THEME_KEY);
    }
  } catch {
    // See read(): the choice then lasts until the page closes.
  }
};

let state = null;
let loaded = false;
const listeners = new Set();
const current = () => {
  if (!loaded) {
    state = read();
    loaded = true;
  }
  return state;
};
const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const keep = (next) => {
  state = next;
  loaded = true;
  write(next);
  listeners.forEach((listener) => listener());
};

/** The theme applied here (`{ theme, before }`), or null for the default. */
export const useCloudTheme = () =>
  useSyncExternalStore(subscribe, current, current);

/** Applies `theme`: its colours, and the mode it asks for. */
export const applyCloudTheme = (theme) => {
  const clean = cleanTheme(theme);
  if (!clean || !applicable(clean)) {
    return false;
  }
  const before = current()?.before ?? currentMode();
  const mode = modeOf(clean);
  if (mode) {
    setThemeMode(mode);
  }
  keep({ theme: clean, before });
  return true;
};

/** Back to the default colours and the mode the user had. */
export const resetCloudTheme = () => {
  const now = current();
  if (now && modeOf(now.theme) && now.before) {
    setThemeMode(now.before);
  }
  keep(null);
};

/** For tests: forget what was read. */
export const forgetCloudTheme = () => {
  state = null;
  loaded = false;
};

/** Keeps the page's tokens in step with the applied theme (mount once). */
export const useApplyCloudTheme = () => {
  const choice = useCloudTheme();
  const { theme: mode } = useAppearance();
  useEffect(() => {
    const style = globalThis.document?.documentElement?.style;
    if (!style) {
      return undefined;
    }
    const vars = choice ? cloudVars(choice.theme, mode === 'dark') : {};
    for (const [name, value] of Object.entries(vars)) {
      style.setProperty(name, value);
    }
    if (choice) {
      globalThis.document.documentElement.dataset.cloudTheme =
        choice.theme.slug;
    }
    return () => {
      CLOUD_VARS.forEach((name) => style.removeProperty(name));
      delete globalThis.document.documentElement.dataset.cloudTheme;
    };
  }, [choice, mode]);
};

// ---- Cards -----------------------------------------------------------

const Card = ({ theme, dark, selected, children }) => {
  const look = cardLook(theme, dark);
  return el(
    'div',
    {
      className: selected ? 'cloud-theme is-selected' : 'cloud-theme',
      'data-theme-card': theme.slug,
    },
    [
      el(
        'span',
        {
          key: 'p',
          className: 'cloud-theme-preview',
          'aria-hidden': 'true',
          style: look
            ? {
                '--ct-ground': look.ground,
                '--ct-accent': look.accent,
                '--ct-bubble': look.bubble,
                '--ct-text': look.text,
              }
            : undefined,
        },
        [
          el('span', { key: 'i', className: 'cloud-theme-in' }),
          el('span', { key: 'o', className: 'cloud-theme-out' }),
          el('span', { key: 'a', className: 'cloud-theme-accent' }),
        ]
      ),
      el(
        'strong',
        { key: 't', className: 'cloud-theme-title' },
        theme.title || theme.slug
      ),
      children,
    ]
  );
};

const errorText = (t, code) => {
  const key = `settings.cloudThemes.err.${code}`;
  const text = t(key);
  return text === key ? t('settings.cloudThemes.err.failed') : text;
};

// Applying: here at once, and the account told (best effort).
const applyTheme = (api, theme, dark) => {
  if (!applyCloudTheme(theme)) {
    return;
  }
  if (typeof api?.telegramCloudThemeInstall === 'function' && theme.id) {
    const forced = modeOf(theme);
    Promise.resolve(
      api.telegramCloudThemeInstall({
        id: theme.id,
        accessHash: theme.accessHash,
        dark: forced ? forced === 'dark' : dark,
      })
    ).catch(() => {});
  }
};

const useThemeList = (api) => {
  const [list, setList] = useState({ status: 'loading', themes: [] });
  useEffect(() => {
    if (typeof api?.telegramCloudThemes !== 'function') {
      setList({ status: 'unavailable', themes: [] });
      return undefined;
    }
    let live = true;
    api
      .telegramCloudThemes({})
      .catch(() => null)
      .then((answer) => {
        if (live) {
          setList(
            answer?.ok
              ? {
                  status: 'ready',
                  themes: (answer.themes ?? []).map(cleanTheme).filter(Boolean),
                }
              : { status: 'unavailable', themes: [], code: answer?.code }
          );
        }
      });
    return () => {
      live = false;
    };
  }, [api]);
  return list;
};

/** Settings → Chat settings: the cloud themes as cards. */
export const CloudThemeSettings = ({ api }) => {
  const t = useT();
  const { theme: mode } = useAppearance();
  const dark = mode === 'dark';
  const chosen = useCloudTheme();
  const list = useThemeList(api);
  const onDefault = () => {
    resetCloudTheme();
    if (typeof api?.telegramCloudThemeInstall === 'function') {
      Promise.resolve(api.telegramCloudThemeInstall({ reset: true })).catch(
        () => {}
      );
    }
  };
  return el(
    'section',
    {
      className: 'card cloud-themes',
      'aria-labelledby': 'cloud-themes-title',
      'data-section': 'cloud-themes',
    },
    [
      el(
        'h3',
        { key: 'h', id: 'cloud-themes-title' },
        t('settings.cloudThemes.title')
      ),
      el('p', { key: 'i', className: 'meta' }, t('settings.cloudThemes.intro')),
      list.status === 'loading'
        ? el(
            'p',
            { key: 'l', className: 'meta' },
            t('settings.cloudThemes.loading')
          )
        : null,
      list.status === 'unavailable'
        ? el(
            'p',
            { key: 'u', className: 'meta', 'data-cloud-themes': 'unavailable' },
            errorText(t, list.code ?? 'failed')
          )
        : null,
      list.status === 'ready' && list.themes.length === 0
        ? el(
            'p',
            { key: 'n', className: 'meta' },
            t('settings.cloudThemes.none')
          )
        : null,
      el(
        'div',
        { key: 'g', className: 'cloud-theme-grid', role: 'list' },
        list.themes.map((theme) =>
          el(
            Card,
            {
              key: theme.slug,
              theme,
              dark,
              selected: chosen?.theme.slug === theme.slug,
            },
            el(
              'button',
              {
                type: 'button',
                'data-action': 'cloud-theme-apply',
                disabled: !applicable(theme),
                onClick: () => applyTheme(api, theme, dark),
              },
              applicable(theme)
                ? t('settings.cloudThemes.apply')
                : t('settings.cloudThemes.noPreview')
            )
          )
        )
      ),
      el(
        'button',
        {
          key: 'd',
          type: 'button',
          'data-action': 'cloud-theme-default',
          disabled: !chosen,
          onClick: onDefault,
        },
        t('settings.cloudThemes.default')
      ),
    ]
  );
};

// ---- A theme's link --------------------------------------------------

const EVENT = 'ms-addtheme-open';

/**
 * Asks the dialog (mounted once, in the app) to open for a t.me/addtheme
 * link; true when `href` is one.
 */
export const openThemeLink = (href) => {
  const slug = addthemeSlugOf(href);
  if (!slug || !globalThis.dispatchEvent) {
    return false;
  }
  globalThis.dispatchEvent(new CustomEvent(EVENT, { detail: { slug } }));
  return true;
};

const useLinkedTheme = (api, slug) => {
  const [state, setState] = useState({ phase: 'loading' });
  useEffect(() => {
    let live = true;
    Promise.resolve(api.telegramCloudTheme({ slug }))
      .catch(() => null)
      .then((answer) => {
        const theme = answer?.ok ? cleanTheme(answer.theme) : null;
        if (live) {
          setState(
            theme
              ? { phase: 'ready', theme }
              : { phase: 'error', code: answer?.code ?? 'failed' }
          );
        }
      });
    return () => {
      live = false;
    };
  }, [api, slug]);
  return state;
};

const ThemeDialog = ({ api, slug, close }) => {
  const t = useT();
  const { theme: mode } = useAppearance();
  const state = useLinkedTheme(api, slug);
  const theme = state.theme;
  let body;
  if (state.phase === 'loading') {
    body = el('p', { className: 'meta' }, t('settings.cloudThemes.loading'));
  } else if (state.phase === 'error') {
    body = el(
      'p',
      { role: 'alert', 'data-theme-link': 'error' },
      errorText(t, state.code)
    );
  } else {
    body = el(Card, { theme, dark: mode === 'dark', selected: false });
  }
  return el(
    Frame,
    { title: t('settings.cloudThemes.linkTitle'), close, name: 'add-theme' },
    el('div', { className: 'admin-body' }, [
      body,
      el('div', { key: 'f', className: 'translate-foot' }, [
        theme && applicable(theme)
          ? el(
              'button',
              {
                key: 'a',
                type: 'button',
                className: 'primary',
                'data-action': 'theme-link-apply',
                onClick: () => {
                  applyTheme(api, theme, mode === 'dark');
                  close();
                },
              },
              t('settings.cloudThemes.apply')
            )
          : null,
        el(
          'button',
          {
            key: 'x',
            type: 'button',
            'data-action': 'theme-link-close',
            onClick: close,
          },
          t('settings.cloudThemes.close')
        ),
      ]),
    ])
  );
};

/** Mounted once: opens a theme's preview when a link asks. */
export const AddthemeHost = ({ api }) => {
  const [slug, setSlug] = useState(null);
  useEffect(() => {
    const on = (event) => setSlug(event.detail?.slug ?? null);
    globalThis.addEventListener?.(EVENT, on);
    return () => globalThis.removeEventListener?.(EVENT, on);
  }, []);
  return slug && typeof api?.telegramCloudTheme === 'function'
    ? el(ThemeDialog, { key: slug, api, slug, close: () => setSlug(null) })
    : null;
};
