// Restricted "browser-only" mode (issue #37): the SPA works from the
// browser store alone, and features that need a server (imports,
// automations, sync, CV sync, greetings) turn on once discovery finds
// a local one. This module decides what the notice in
// ./web-mode-banner.js shows; it touches no DOM so Node can test it.

import { localServerHelp } from './connection-guides.js';

export const DOWNLOAD_PAGE_URL =
  'https://link-foundation.github.io/meta-sovereign/download/';
export const DISMISS_STORAGE_KEY = 'metaSovereignWebModeDismissed';

// The npm package may not be published yet, so the notice offers the
// GitHub form of the same command next to the npm one.
const SERVER_OPTION_IDS = ['js-node', 'js-github'];

/** 'electron' | 'capacitor' | 'web' — where the SPA is running. */
export const runtimeOf = ({
  shell = globalThis.metaSovereignShell,
  capacitor = globalThis.Capacitor,
} = {}) => {
  if (shell?.platform === 'electron') {
    return 'electron';
  }
  if (capacitor || shell?.platform === 'capacitor') {
    return 'capacitor';
  }
  return 'web';
};

/** Safari (macOS or iOS) — it refuses https → http://127.0.0.1 fetches. */
export const isSafari = (userAgent = '') =>
  /Safari\//.test(userAgent) &&
  !/Chrome|Chromium|CriOS|FxiOS|EdgiOS|Edg\/|OPR\/|Android/.test(userAgent);

// On GitHub Pages the download page sits next to the SPA, so a relative
// link keeps forks pointing at their own releases. Anywhere else (a
// file:// copy, a self-hosted build) use the canonical page.
const downloadHref = (location) =>
  /\.github\.io$/.test(location?.hostname ?? '')
    ? './download/'
    : DOWNLOAD_PAGE_URL;

// Offer a local UI only when the server's beacon confirms it is enabled.
// The default hosted UI connects through the trusted local HTTPS API.
const localLinks = (nearby) => {
  if (nearby) {
    // With https on, trusting its certificate once lets this page in.
    const trustHref = nearby.tls
      ? `${nearby.origin.replace(/^http:/, 'https:')}/trust`
      : null;
    return nearby.localUi
      ? { localHref: `${nearby.origin}/`, localFound: nearby.origin, trustHref }
      : { localHref: null, localOff: nearby.origin, trustHref };
  }
  return { localHref: null };
};

/**
 * What the browser-only notice should show, or null when it should
 * not show at all (still discovering, or a server is connected).
 */
export const webModeNotice = ({
  online,
  nearby = null,
  runtime = runtimeOf(),
  userAgent = globalThis.navigator?.userAgent,
  location = globalThis.location,
} = {}) => {
  if (online !== false) {
    return null;
  }
  // Safari's limit is on https pages; the server's own copy is http.
  const safariHint =
    runtime === 'web' && location?.protocol === 'https:' && isSafari(userAgent);
  return {
    runtime,
    // The desktop app already bundles the server; a phone cannot run
    // the desktop build, so only plain browsers get the download link.
    downloadHref: runtime === 'web' ? downloadHref(location) : null,
    safariHint,
    ...localLinks(nearby),
    commands: localServerHelp.options.filter((option) =>
      SERVER_OPTION_IDS.includes(option.id)
    ),
  };
};
