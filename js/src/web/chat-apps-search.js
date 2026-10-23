// "Apps" in the chat list's search, as Telegram Desktop's search has it
// (R-Y194; learned, never copied): with the search box focused, or a query
// typed, the popular mini apps are listed under it — avatar, name and
// monthly users — a page at a time ("Show more"). A click opens the bot's
// chat; "Open" launches its main mini app. Typed words narrow the list to
// the apps whose name or username holds them. Read only.

import React, { useEffect, useRef, useState } from 'react';
import { useT } from './i18n.js';
import { Spinner } from './spinner.js';
import { ChatAvatar } from './chat-list.js';
import { openWebApp } from './chat-web-apps.js';
import {
  appTarget,
  filterApps,
  mainAppRequest,
  mergeApps,
} from './apps-model.js';

const el = React.createElement;

const PAGE = 20;
// The app's window is hosted by the open chat; a chat just opened has a
// moment to mount it.
const RETRY_MS = 250;
const RETRIES = 12;
const RELEASE_MS = 120;

/** The search box's focus: `{ focused, ref, props, release }`. */
export const useSearchFocus = () => {
  const [focused, setFocused] = useState(false);
  const ref = useRef(null);
  return {
    focused,
    ref,
    props: {
      ref,
      onFocus: () => setFocused(true),
      onBlur: () => setFocused(false),
    },
    release: () => {
      ref.current?.blur?.();
      setFocused(false);
    },
  };
};

/** The pages read so far: `{ apps, next, loading, more }`. */
export const useApps = (api, on) => {
  const [state, setState] = useState({
    apps: [],
    next: null,
    loading: false,
    started: false,
  });
  const busy = useRef(false);
  const ask = async (offset) => {
    if (busy.current) {
      return;
    }
    busy.current = true;
    setState((now) => ({ ...now, loading: true, started: true }));
    const answer = await api
      .telegramAppsPopular({ ...(offset ? { offset } : {}), limit: PAGE })
      .catch(() => null);
    busy.current = false;
    setState((now) => ({
      apps: answer?.ok ? mergeApps(now.apps, answer.apps ?? []) : now.apps,
      next: answer?.ok ? (answer.next ?? null) : null,
      loading: false,
      started: true,
    }));
  };
  useEffect(() => {
    if (on && !state.started) {
      ask('');
    }
  }, [on]);
  return { ...state, more: () => state.next && ask(state.next) };
};

// Opens the bot's main mini app once the chat has mounted its host.
const launchMain = (request, tries = RETRIES) => {
  if (!openWebApp(request) && tries > 0) {
    globalThis.setTimeout(() => launchMain(request, tries - 1), RETRY_MS);
  }
};

const Row = ({ api, app, t, onOpen, onLaunch }) =>
  el('div', { className: 'apps-row', 'data-app': app.chat }, [
    el(
      'button',
      {
        key: 'b',
        type: 'button',
        className: 'chat-item global-peer apps-open-chat',
        'data-action': 'app-chat',
        onClick: () => onOpen(app),
      },
      [
        el(ChatAvatar, {
          key: 'a',
          api,
          chat: { source: 'telegram', chat: app.chat, name: app.name },
        }),
        el('span', { key: 'n', className: 'chat-item-body' }, [
          el('span', { key: 't', className: 'chat-item-title' }, app.name),
          app.users
            ? el(
                'span',
                {
                  key: 'u',
                  className: 'chat-item-preview',
                  'data-app-users': '',
                },
                t('chat.apps.users', { count: app.users })
              )
            : null,
        ]),
      ]
    ),
    mainAppRequest(app)
      ? el(
          'button',
          {
            key: 'o',
            type: 'button',
            className: 'apps-launch',
            'data-action': 'app-launch',
            'aria-label': t('chat.apps.openApp', { name: app.name }),
            onClick: () => onLaunch(app),
          },
          t('chat.apps.launch')
        )
      : null,
  ]);

/**
 * The section under the search box; `show` says whether the box is in use
 * (focused or a query typed), `query` narrows the list and `open(target)`
 * opens a bot's chat.
 */
export const AppsSection = ({ api, show, query, open, release }) => {
  const t = useT();
  const on = show && typeof api?.telegramAppsPopular === 'function';
  const list = useApps(api, on);
  const apps = filterApps(list.apps, query);
  if (!on || (apps.length === 0 && !list.loading)) {
    return null;
  }
  // The chat opens first; the box lets go a moment later, so the list
  // does not change under the chat as it mounts.
  const opened = (app) => {
    open(appTarget(app));
    globalThis.setTimeout(release, RELEASE_MS);
  };
  const launched = (app) => {
    opened(app);
    launchMain(mainAppRequest(app));
  };
  return el(
    'section',
    {
      className: 'apps-section',
      'data-apps': '',
      'aria-label': t('chat.apps.title'),
      // Clicks here keep the search box focused, so the list stays.
      onMouseDown: (event) => event.preventDefault(),
    },
    [
      el('h3', { key: 'h', className: 'apps-title' }, t('chat.apps.title')),
      el(
        'div',
        { key: 'l', className: 'apps-list' },
        apps.map((app) =>
          el(Row, {
            key: app.chat,
            api,
            app,
            t,
            onOpen: opened,
            onLaunch: launched,
          })
        )
      ),
      list.loading
        ? el('p', { key: 's', className: 'meta' }, el(Spinner))
        : null,
      list.next && !list.loading
        ? el(
            'button',
            {
              key: 'm',
              type: 'button',
              className: 'apps-more',
              'data-action': 'apps-more',
              onClick: list.more,
            },
            t('chat.apps.more')
          )
        : null,
    ]
  );
};
