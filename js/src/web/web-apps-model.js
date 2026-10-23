// A bot's mini apps (Web Apps), the pure parts (R-Y168; learned from
// Telegram's public Mini Apps documentation, never copied): which
// addresses may be opened, the links that name an app, the theme the app
// is told, what a message from the app's frame must look like to be
// believed, what each documented `web_app_*` event does to the panel, and
// the timer that keeps an open query alive. Nothing here touches the page.

/** Only an https address, without credentials; else null. */
export const appUrl = (value) => {
  const raw = String(value ?? '').trim();
  if (!raw || raw.length > 2048) {
    return null;
  }
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
};

/** The origin messages from this address's frame carry; null if unusable. */
export const originOf = (value) => {
  const url = appUrl(value);
  return url ? new URL(url).origin : null;
};

// ---------------------------------------------------------------- links

const HOSTS = /^(?:www\.)?(?:t\.me|telegram\.me|telegram\.dog)$/i;
const NAME = /^[A-Za-z][A-Za-z0-9_]{3,31}$/;
const SHORT = /^[A-Za-z][A-Za-z0-9_]{2,31}$/;
const START = /^[A-Za-z0-9_-]{0,512}$/;
// Paths of t.me that are not a bot's username.
const RESERVED = new Set([
  'c',
  's',
  'joinchat',
  'addstickers',
  'addemoji',
  'addtheme',
  'addlist',
  'share',
  'proxy',
  'socks',
  'login',
  'boost',
  'giftcode',
  'invoice',
  'setlanguage',
  'confirmphone',
  'contact',
  'iv',
  'bg',
  'm',
]);

const appOf = (username, shortName, query) => {
  const start = query.get('startapp');
  if (
    !NAME.test(username ?? '') ||
    RESERVED.has(String(username).toLowerCase()) ||
    (start !== null && !START.test(start))
  ) {
    return null;
  }
  if (shortName) {
    return SHORT.test(shortName)
      ? { kind: 'app', username, shortName, startParam: start }
      : null;
  }
  // Without an app name the bot's main app, and only for `?startapp`.
  return start === null
    ? null
    : { kind: 'main', username, shortName: null, startParam: start };
};

/**
 * The app a link names: t.me/bot/app(?startapp=x), t.me/bot?startapp=x or
 * tg://resolve?domain=bot&appname=app&startapp=x →
 * `{ kind: 'app'|'main', username, shortName, startParam }`; null for
 * anything else (a message link, a plain bot link).
 */
export const parseAppLink = (href) => {
  let url;
  try {
    url = new URL(String(href ?? '').trim());
  } catch {
    return null;
  }
  if (url.protocol === 'tg:') {
    return url.hostname === 'resolve'
      ? appOf(
          url.searchParams.get('domain'),
          url.searchParams.get('appname'),
          url.searchParams
        )
      : null;
  }
  if (
    url.protocol !== 'https:' ||
    !HOSTS.test(url.hostname) ||
    url.username ||
    url.password
  ) {
    return null;
  }
  const [head, second, ...more] = url.pathname.split('/').filter(Boolean);
  return more.length > 0 ? null : appOf(head, second, url.searchParams);
};

/** A `path_full` of web_app_open_tg_link as a t.me address; else null. */
export const tgLinkOf = (path) => {
  const value = String(path ?? '');
  if (
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.length > 512 ||
    // eslint-disable-next-line no-control-regex
    /[\u0000-\u001f\\]/.test(value)
  ) {
    return null;
  }
  try {
    const url = new URL(`https://t.me${value}`);
    return url.hostname === 't.me' ? url.href : null;
  } catch {
    return null;
  }
};

// ---------------------------------------------------------------- theme

/** `#rrggbb` from #rgb, #rrggbb(aa), rgb() or rgba(); else null. */
export const hexOf = (value) => {
  const text = String(value ?? '')
    .trim()
    .toLowerCase();
  const hex = /^#([0-9a-f]{3})$/.exec(text);
  if (hex) {
    return `#${[...hex[1]].map((d) => d + d).join('')}`;
  }
  const long = /^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/.exec(text);
  if (long) {
    return `#${long[1]}`;
  }
  const rgb = /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(text);
  if (!rgb) {
    return null;
  }
  const parts = rgb.slice(1, 4).map(Number);
  return parts.every((n) => n <= 255)
    ? `#${parts.map((n) => n.toString(16).padStart(2, '0')).join('')}`
    : null;
};

// theme_params key -> [the app's colour variable, a fallback].
const THEME = {
  bg_color: ['--bg-elev', '#161b22'],
  secondary_bg_color: ['--bg', '#0e1116'],
  text_color: ['--text', '#e6edf3'],
  hint_color: ['--text-subtle', '#9198a1'],
  link_color: ['--link', '#4493f8'],
  button_color: ['--accent', '#238636'],
  button_text_color: [null, '#ffffff'],
  header_bg_color: ['--bg-elev', '#161b22'],
  bottom_bar_bg_color: ['--bg-elev', '#161b22'],
  accent_text_color: ['--link', '#4493f8'],
  section_bg_color: ['--bg', '#0e1116'],
  section_header_text_color: ['--text-subtle', '#9198a1'],
  section_separator_color: ['--border', '#30363d'],
  subtitle_text_color: ['--text-subtle', '#9198a1'],
  destructive_text_color: ['--danger', '#f85149'],
};

/**
 * The app's colours as Telegram's theme_params (`key: #rrggbb`), read
 * with `read(variable)` (a CSS variable's value); a colour that cannot be
 * read falls back to the dark theme's.
 */
export const themeParamsOf = (read) =>
  Object.fromEntries(
    Object.entries(THEME).map(([key, [variable, fallback]]) => [
      key,
      (variable && hexOf(read(variable))) || fallback,
    ])
  );

/** The viewport_changed data for a panel of this size. */
export const viewportOf = ({ width, height, expanded, stable = true }) => ({
  height: Math.max(0, Math.round(height)),
  width: Math.max(0, Math.round(width)),
  is_expanded: Boolean(expanded),
  is_state_stable: Boolean(stable),
});

/** What is posted to the app's frame for `type` and `data`. */
export const outgoing = (type, data) =>
  JSON.stringify({ eventType: type, eventData: data ?? {} });

// --------------------------------------------------------------- inbound

const isObject = (v) =>
  Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const color = (v) => (typeof v === 'string' && hexOf(v) ? hexOf(v) : null);
const flag = (v, fallback) => (typeof v === 'boolean' ? v : fallback);
const words = (v, max) =>
  typeof v === 'string' && v.trim().length > 0 && v.length <= max
    ? v.trim()
    : null;

export const MAX_DATA = 4096;
const POPUP_TYPES = new Set([
  'default',
  'ok',
  'close',
  'cancel',
  'destructive',
]);
const POSITIONS = new Set(['left', 'right', 'top', 'bottom']);

const buttonOf = (data, secondary) => ({
  visible: flag(data.is_visible, false),
  active: flag(data.is_active, true),
  progress: flag(data.is_progress_visible, false),
  text: words(data.text, 64) ?? '',
  color: color(data.color),
  textColor: color(data.text_color),
  ...(secondary
    ? { position: POSITIONS.has(data.position) ? data.position : 'left' }
    : {}),
});

// One popup button: the id, the type, and the words (not for ok/close/cancel).
const popupButton = (raw) => {
  if (!isObject(raw)) {
    return null;
  }
  const type = raw.type === undefined ? 'default' : raw.type;
  const id = raw.id === undefined ? '' : raw.id;
  const text = words(raw.text, 64);
  const needsText = type === 'default' || type === 'destructive';
  return POPUP_TYPES.has(type) &&
    typeof id === 'string' &&
    id.length <= 64 &&
    (!needsText || text)
    ? { id, type, text }
    : null;
};

const popupOf = (data) => {
  const message = words(data.message, 256);
  const title = data.title === undefined ? '' : words(data.title, 64);
  const raw = data.buttons === undefined ? [{ type: 'close' }] : data.buttons;
  if (!message || title === null || !Array.isArray(raw) || raw.length > 3) {
    return null;
  }
  const buttons = raw.map(popupButton);
  return raw.length > 0 && buttons.every(Boolean)
    ? { title, message, buttons }
    : null;
};

const headerOf = (data) => {
  if (
    data.color_key === 'bg_color' ||
    data.color_key === 'secondary_bg_color'
  ) {
    return { color: data.color_key };
  }
  return color(data.color) ? { color: color(data.color) } : null;
};

// Each documented event the page acts on: how its data is read; null
// data refuses the event.
const READERS = {
  web_app_ready: () => ({}),
  web_app_expand: () => ({}),
  web_app_close: () => ({}),
  web_app_request_theme: () => ({}),
  web_app_request_viewport: () => ({}),
  web_app_request_safe_area: () => ({}),
  web_app_request_content_safe_area: () => ({}),
  web_app_setup_main_button: (d) => buttonOf(d, false),
  web_app_setup_secondary_button: (d) => buttonOf(d, true),
  web_app_setup_back_button: (d) => ({ visible: flag(d.is_visible, false) }),
  web_app_setup_closing_behavior: (d) => ({
    confirm: flag(d.need_confirmation, false),
  }),
  web_app_open_link: (d) => {
    const url = appUrl(d.url);
    return url ? { url } : null;
  },
  web_app_open_tg_link: (d) => {
    const url = tgLinkOf(d.path_full);
    return url ? { url } : null;
  },
  web_app_open_popup: popupOf,
  web_app_data_send: (d) =>
    typeof d.data === 'string' &&
    d.data.length > 0 &&
    new TextEncoder().encode(d.data).length <= MAX_DATA
      ? { data: d.data }
      : null,
  // A message the app's bot prepared (R-Y194): its id only.
  web_app_send_prepared_message: (d) =>
    typeof d.id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(d.id)
      ? { id: d.id }
      : null,
  web_app_set_header_color: headerOf,
  web_app_set_background_color: (d) =>
    color(d.color) ? { color: color(d.color) } : null,
  web_app_set_bottom_bar_color: (d) =>
    color(d.color) ? { color: color(d.color) } : null,
};

/** The events the panel acts on. Everything else is ignored. */
export const KNOWN_EVENTS = Object.keys(READERS);

// The message's body as an object: JSON text (not too long) or an object.
const bodyOf = (data) => {
  if (typeof data !== 'string') {
    return isObject(data) ? data : null;
  }
  try {
    const body = data.length > 20_000 ? null : JSON.parse(data);
    return isObject(body) ? body : null;
  } catch {
    return null;
  }
};

/**
 * What a `message` event from the app's frame says, if it can be
 * believed: `{ type, data }` with the data read by the event's rules, or
 * null. The message must come from `frame` (the iframe's window) and
 * carry `origin` (the address's origin); its body is JSON text (or an
 * object) `{ eventType, eventData }` of a known event with valid data.
 */
export const readBridgeMessage = (event, { frame, origin }) => {
  if (!frame || !origin || event?.source !== frame || event.origin !== origin) {
    return null;
  }
  const body = bodyOf(event.data);
  const type = body?.eventType;
  if (typeof type !== 'string' || !Object.hasOwn(READERS, type)) {
    return null;
  }
  const raw = body.eventData === undefined ? {} : body.eventData;
  const data = isObject(raw) ? READERS[type](raw) : null;
  return data ? { type, data } : null;
};

// ----------------------------------------------------------------- panel

/** What the panel shows before the app says anything. */
export const initialPanel = () => ({
  ready: false,
  expanded: false,
  main: { visible: false, active: true, progress: false, text: '' },
  secondary: {
    visible: false,
    active: true,
    progress: false,
    text: '',
    position: 'left',
  },
  back: false,
  confirmClose: false,
  header: null,
  background: null,
  bottom: null,
});

const SETTERS = {
  web_app_ready: (s) => ({ ...s, ready: true }),
  web_app_expand: (s) => ({ ...s, expanded: true }),
  web_app_setup_main_button: (s, d) => ({ ...s, main: d }),
  web_app_setup_secondary_button: (s, d) => ({ ...s, secondary: d }),
  web_app_setup_back_button: (s, d) => ({ ...s, back: d.visible }),
  web_app_setup_closing_behavior: (s, d) => ({ ...s, confirmClose: d.confirm }),
  web_app_set_header_color: (s, d) => ({ ...s, header: d.color }),
  web_app_set_background_color: (s, d) => ({ ...s, background: d.color }),
  web_app_set_bottom_bar_color: (s, d) => ({ ...s, bottom: d.color }),
};

/** The panel after an event (unchanged when the event has no effect on it). */
export const panelAfter = (state, event) =>
  SETTERS[event.type] ? SETTERS[event.type](state, event.data) : state;

/** Whether a button shows: visible, with words. */
export const buttonShown = (button) =>
  Boolean(button?.visible) && Boolean(button.text);

// ---------------------------------------------------------------- timer

/** The query is kept alive this often while the app is open. */
export const PROLONG_MS = 60_000;

/**
 * Calls `prolong()` every `ms` until the returned stop is called; a call
 * that fails or throws is dropped, as the query's end is the app's own.
 */
export const startProlong = (prolong, ms = PROLONG_MS) => {
  const timer = globalThis.setInterval(() => {
    try {
      Promise.resolve(prolong()).catch(() => {});
    } catch {
      // The next tick tries again.
    }
  }, ms);
  return () => globalThis.clearInterval(timer);
};
