// A bot's mini app, as Telegram Desktop shows it (R-Y168; learned from
// Telegram's public Mini Apps documentation, never copied): a window of
// about 384 by 640 you can resize, a header with the bot's name, a back
// arrow when the app wants one, a ⋯ menu (Reload, Close) and a close
// button, the app below in a frame, and its MainButton / SecondaryButton
// at the bottom while it shows them.
//
// The app is a web page of the bot's own https origin, so it runs in a
// sandboxed `<iframe>`: scripts, its own origin's storage, forms and
// popups — and nothing else. It cannot navigate this page, open browser
// dialogs (it asks us for the pop-ups it wants and we draw them), start
// downloads, or reach the app's session. Only messages from that frame,
// carrying its origin, are heard; what it asks is read by strict rules
// (web-apps-model.js) and anything else is ignored.

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useT } from './i18n.js';
import { Icon } from './icons.js';
import {
  appUrl,
  buttonShown,
  initialPanel,
  originOf,
  outgoing,
  panelAfter,
  readBridgeMessage,
  startProlong,
  themeParamsOf,
  viewportOf,
} from './web-apps-model.js';
import { openMessageLink } from './message-links.js';
import { usePreparedShare } from './chat-prepared-share.js';
import { WebAppLoading, useWebAppProgress } from './web-app-loading.js';

const el = React.createElement;

const EVENT = 'ms-web-app';

// The frame may use scripts, its own origin, forms and popups; popups
// leave the sandbox so the pages they open work. Not allowed: top
// navigation, modals (alert/confirm/prompt), downloads, presentation.
export const SANDBOX =
  'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox';

/**
 * Asks the chat screen to open a mini app (`request`: `kind`, and the
 * bot / chat / address / link fields of `webAppOpen`, `name` for the
 * title, `buttonText` for a reply keyboard's). True when a screen took it.
 */
export const openWebApp = (request) => {
  if (!globalThis.dispatchEvent) {
    return false;
  }
  const detail = { request, handled: false };
  globalThis.dispatchEvent(new CustomEvent(EVENT, { detail }));
  return detail.handled;
};

const themeNow = () => {
  const style = globalThis.getComputedStyle?.(
    globalThis.document.documentElement
  );
  return themeParamsOf((name) => style?.getPropertyValue(name) ?? '');
};

const BODY = ['kind', 'chat', 'bot', 'url', 'username', 'shortName'];

// The request as the server takes it, with the colours now.
export const serverBody = (request, theme) => ({
  ...Object.fromEntries(
    BODY.filter((k) => request[k] !== undefined && request[k] !== null).map(
      (k) => [k, request[k]]
    )
  ),
  ...(request.startParam ? { startParam: request.startParam } : {}),
  theme,
});

const browser = (href) =>
  globalThis.open?.(href, '_blank', 'noopener,noreferrer');

/** Mounted once in the chat screen: `{ dialog }` shows the open app. */
export const useWebAppHost = ({ api, state }) => {
  const [session, setSession] = useState(null);
  const counter = useRef(0);
  const open = async (request) => {
    counter.current += 1;
    const id = counter.current;
    setSession({ id, request, url: null });
    const answer = await Promise.resolve(
      api?.telegramWebAppOpen?.(serverBody(request, themeNow()))
    ).catch(() => null);
    if (counter.current !== id) {
      return;
    }
    const url = appUrl(answer?.url);
    // Never the app's own origin: the sandbox keeps nothing apart then.
    if (!answer?.ok || !url || originOf(url) === globalThis.location?.origin) {
      setSession({ id, request, url: null, error: answer?.code ?? 'failed' });
      return;
    }
    setSession({
      id,
      request,
      url,
      queryId: answer.queryId ?? null,
      bot: answer.bot ?? null,
    });
  };
  const latest = useRef(open);
  latest.current = open;
  useEffect(() => {
    const on = (event) => {
      event.detail.handled = true;
      latest.current(event.detail.request);
    };
    globalThis.addEventListener?.(EVENT, on);
    return () => globalThis.removeEventListener?.(EVENT, on);
  }, []);
  const close = () => {
    counter.current += 1;
    setSession(null);
  };
  return {
    dialog: session
      ? el(WebAppPanel, {
          key: `web-app-${session.id}`,
          session,
          api,
          chats: state?.chats,
          onClose: close,
          onReload: () => latest.current(session.request),
        })
      : null,
  };
};

// A message posted to the app's frame, for its origin only.
const postTo = (frame, origin, type, data) => {
  try {
    frame?.contentWindow?.postMessage(outgoing(type, data), origin);
  } catch {
    // The frame went away.
  }
};

const SAFE = { left: 0, top: 0, right: 0, bottom: 0 };

// What each event the app asks does besides changing the panel: `c` is
// `{ post, size, request, session, api, close, popup }`.
const EFFECTS = {
  iframe_ready: (c) => {
    c.post('theme_changed', { theme_params: themeNow() });
    c.post('viewport_changed', c.size());
  },
  web_app_request_theme: (c) =>
    c.post('theme_changed', { theme_params: themeNow() }),
  web_app_request_viewport: (c) => c.post('viewport_changed', c.size()),
  web_app_request_safe_area: (c) => c.post('safe_area_changed', SAFE),
  web_app_request_content_safe_area: (c) =>
    c.post('content_safe_area_changed', SAFE),
  web_app_close: (c) => c.close(),
  web_app_open_link: (c, d) => browser(d.url),
  web_app_open_tg_link: (_c, d) => openMessageLink(d.url) || browser(d.url),
  web_app_open_popup: (c, d) => c.popup(d),
  web_app_data_send: (c, d) => c.sendData(d.data),
  web_app_send_prepared_message: (c, d) => c.prepared(d.id),
};

const COMPACT = /\s+/g;

// The reply keyboard's app sends its data and ends (R-Y168); no other
// kind may.
const dataSender =
  ({ session, api, close }) =>
  (data) => {
    const { request } = session;
    if (request.kind !== 'simple' || !request.buttonText) {
      return;
    }
    Promise.resolve(
      api?.telegramWebAppData?.({
        bot: String(request.bot),
        text: String(request.buttonText).replace(COMPACT, ' ').slice(0, 64),
        data,
      })
    ).catch(() => null);
    close();
  };

// The app's messages, heard while the panel is open.
const useBridge = ({ session, frame, onEvent }) => {
  const latest = useRef(onEvent);
  latest.current = onEvent;
  useLayoutEffect(() => {
    const origin = originOf(session.url);
    const on = (event) => {
      const message = readBridgeMessage(event, {
        frame: frame.current?.contentWindow,
        origin,
      });
      if (message) {
        latest.current(message);
      }
    };
    globalThis.addEventListener('message', on);
    return () => globalThis.removeEventListener('message', on);
  }, [session.url]);
};

// The query kept alive while the app is open (silent).
const useProlong = ({ session, api }) => {
  const { request, queryId } = session;
  useEffect(() => {
    if (!queryId || request.chat === undefined || request.bot === undefined) {
      return undefined;
    }
    return startProlong(() =>
      api?.telegramWebAppProlong?.({
        chat: String(request.chat),
        bot: String(request.bot),
        queryId: String(queryId),
      })
    );
  }, [queryId]);
};

// The colours and size told to the app as they change.
const useAppliance = ({ frame, body, session, size }) => {
  const origin = originOf(session.url);
  useEffect(() => {
    const root = globalThis.document?.documentElement;
    if (!root || !globalThis.MutationObserver) {
      return undefined;
    }
    const watch = new globalThis.MutationObserver(() =>
      postTo(frame.current, origin, 'theme_changed', {
        theme_params: themeNow(),
      })
    );
    watch.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    return () => watch.disconnect();
  }, [session.url]);
  useEffect(() => {
    if (!body.current || !globalThis.ResizeObserver) {
      return undefined;
    }
    const watch = new globalThis.ResizeObserver(() =>
      postTo(frame.current, origin, 'viewport_changed', size())
    );
    watch.observe(body.current);
    return () => watch.disconnect();
  }, [session.url]);
};

const COLORS = {
  bg_color: 'var(--bg-elev)',
  secondary_bg_color: 'var(--bg)',
};
const colorOf = (value) => (value ? (COLORS[value] ?? value) : undefined);

const AppButton = ({ button, kind, onPress }) => {
  const style = {
    ...(button.color ? { background: button.color } : {}),
    ...(button.textColor ? { color: button.textColor } : {}),
  };
  return el(
    'button',
    {
      type: 'button',
      className: `web-app-button is-${kind}`,
      'data-action': `web-app-${kind}`,
      disabled: !button.active || button.progress,
      'aria-busy': button.progress ? 'true' : undefined,
      style,
      onClick: onPress,
    },
    button.progress
      ? el('span', { className: 'web-app-spinner', 'aria-hidden': 'true' })
      : button.text
  );
};

// The buttons at the bottom: the app's own, the secondary placed by it.
const Bottom = ({ panel, post }) => {
  const main = buttonShown(panel.main);
  const secondary = buttonShown(panel.secondary);
  if (!main && !secondary) {
    return null;
  }
  const { position } = panel.secondary;
  const first = position === 'top' || position === 'left';
  const parts = [
    main
      ? el(AppButton, {
          key: 'main',
          kind: 'main',
          button: panel.main,
          onPress: () => post('main_button_pressed'),
        })
      : null,
    secondary
      ? el(AppButton, {
          key: 'secondary',
          kind: 'secondary',
          button: panel.secondary,
          onPress: () => post('secondary_button_pressed'),
        })
      : null,
  ];
  return el(
    'div',
    {
      className: `web-app-bottom is-${position === 'top' || position === 'bottom' ? 'column' : 'row'}`,
      style: panel.bottom ? { background: colorOf(panel.bottom) } : undefined,
    },
    first ? parts.reverse() : parts
  );
};

const POPUP_WORDS = {
  ok: 'chat.webApp.ok',
  close: 'chat.webApp.close',
  cancel: 'chat.webApp.cancel',
};

// The pop-up the app asked for (or the one asking to leave), in the panel.
const Popup = ({ popup, onPick }) => {
  const t = useT();
  return el(
    'div',
    { className: 'web-app-popup-wrap', role: 'presentation' },
    el(
      'div',
      {
        className: 'web-app-popup',
        role: 'alertdialog',
        'aria-modal': 'true',
        'aria-label': popup.title || popup.message,
        'data-web-app-popup': true,
      },
      [
        popup.title ? el('h4', { key: 'h' }, popup.title) : null,
        el('p', { key: 'p' }, popup.message),
        el(
          'div',
          { key: 'b', className: 'web-app-popup-buttons' },
          popup.buttons.map((button, i) =>
            el(
              'button',
              {
                key: i,
                type: 'button',
                className:
                  button.type === 'destructive' ? 'is-destructive' : undefined,
                'data-popup-button': button.id,
                onClick: () => onPick(button),
              },
              button.text ?? t(POPUP_WORDS[button.type])
            )
          )
        ),
      ]
    )
  );
};

const Header = ({ panel, title, onBack, onReload, onClose }) => {
  const t = useT();
  const [menu, setMenu] = useState(false);
  return el(
    'div',
    {
      className: 'web-app-header',
      style: panel.header ? { background: colorOf(panel.header) } : undefined,
    },
    [
      panel.back
        ? el(
            'button',
            {
              key: 'back',
              type: 'button',
              className: 'icon-btn',
              'data-action': 'web-app-back',
              'aria-label': t('chat.webApp.back'),
              onClick: onBack,
            },
            el(Icon, { name: 'back', size: 18 })
          )
        : null,
      el('b', { key: 'title', className: 'web-app-title' }, title),
      el(
        'button',
        {
          key: 'more',
          type: 'button',
          className: 'icon-btn web-app-more',
          'data-action': 'web-app-menu',
          'aria-haspopup': 'menu',
          'aria-expanded': menu ? 'true' : 'false',
          'aria-label': t('chat.webApp.more'),
          onClick: () => setMenu(!menu),
        },
        '⋯'
      ),
      el(
        'button',
        {
          key: 'close',
          type: 'button',
          className: 'icon-btn',
          'data-action': 'web-app-close',
          'aria-label': t('chat.webApp.close'),
          onClick: onClose,
        },
        el(Icon, { name: 'close', size: 18 })
      ),
      menu
        ? el(
            'div',
            { key: 'menu', className: 'web-app-menu', role: 'menu' },
            [
              ['reload', onReload],
              ['close', onClose],
            ].map(([name, run]) =>
              el(
                'button',
                {
                  key: name,
                  type: 'button',
                  role: 'menuitem',
                  'data-action': `web-app-${name}-item`,
                  onClick: () => {
                    setMenu(false);
                    run();
                  },
                },
                t(`chat.webApp.${name}`)
              )
            )
          )
        : null,
    ]
  );
};

// The window itself, over the page.
const WebAppPanel = ({ session, api, chats, onClose, onReload }) => {
  const t = useT();
  const frame = useRef(null);
  const body = useRef(null);
  const [panel, setPanel] = useState(initialPanel);
  const progress = useWebAppProgress(panel.ready);
  const [popup, setPopup] = useState(null);
  const origin = originOf(session.url);
  const post = (type, data) => postTo(frame.current, origin, type, data);
  const size = () => {
    const box = body.current?.getBoundingClientRect();
    return viewportOf({
      width: box?.width ?? 0,
      height: box?.height ?? 0,
      expanded: panel.expanded,
    });
  };
  const requestClose = () =>
    panel.confirmClose
      ? setPopup({
          title: '',
          message: t('chat.webApp.confirmClose'),
          buttons: [
            { id: 'cancel', type: 'cancel', text: null },
            { id: 'close', type: 'destructive', text: t('chat.webApp.close') },
          ],
          local: true,
        })
      : onClose();
  // The app's prepared message, chosen a chat for (R-Y194).
  const share = usePreparedShare({
    api,
    bot: session.request.bot ?? session.bot?.id,
    chats,
    post,
  });
  const context = {
    post,
    size,
    prepared: share.ask,
    close: onClose,
    popup: (data) => setPopup((now) => now ?? data),
    sendData: dataSender({ session, api, close: onClose }),
  };
  useBridge({
    session,
    frame,
    onEvent: (message) => {
      setPanel((now) => panelAfter(now, message));
      EFFECTS[message.type]?.(context, message.data);
    },
  });
  useProlong({ session, api });
  useAppliance({ frame, body, session, size });
  const dismiss = () => {
    if (popup && !popup.local) {
      post('popup_closed', {});
    }
    setPopup(null);
  };
  useEffect(() => {
    const onKey = (event) => {
      // The share chooser, when open, takes Escape itself.
      if (event.key === 'Escape' && !share.open) {
        event.preventDefault();
        return popup ? dismiss() : requestClose();
      }
      return undefined;
    };
    globalThis.addEventListener('keydown', onKey);
    return () => globalThis.removeEventListener('keydown', onKey);
  });
  const pick = (button) => {
    if (popup?.local) {
      setPopup(null);
      return button.id === 'close' ? onClose() : undefined;
    }
    post('popup_closed', { button_id: button.id });
    return setPopup(null);
  };
  const title =
    session.bot?.name || session.request.name || t('chat.webApp.title');
  const node = el(
    'div',
    { className: 'web-app-overlay', role: 'presentation' },
    el(
      'div',
      {
        className: panel.expanded ? 'web-app is-expanded' : 'web-app',
        role: 'dialog',
        'aria-label': title,
        'data-web-app': session.request.kind,
      },
      [
        el(Header, {
          key: 'header',
          panel,
          title,
          onBack: () => post('back_button_pressed'),
          onReload,
          onClose: requestClose,
        }),
        el(
          'div',
          {
            key: 'body',
            ref: body,
            className: 'web-app-body',
            style: panel.background
              ? { background: colorOf(panel.background) }
              : undefined,
          },
          [
            session.url
              ? el('iframe', {
                  key: 'frame',
                  ref: frame,
                  className: 'web-app-frame',
                  src: session.url,
                  title,
                  sandbox: SANDBOX,
                  referrerPolicy: 'no-referrer',
                  'data-web-app-frame': true,
                  onError: progress.onError,
                })
              : null,
            el(WebAppLoading, {
              key: 'loading',
              ready: panel.ready,
              failed: progress.failed,
              error: session.error,
              url: session.url,
              onRetry: onReload,
            }),
          ]
        ),
        el(Bottom, { key: 'bottom', panel, post }),
        popup ? el(Popup, { key: 'popup', popup, onPick: pick }) : null,
      ]
    )
  );
  const root = globalThis.document?.body;
  return el(React.Fragment, null, [
    root ? createPortal(node, root) : node,
    share.dialog,
  ]);
};
