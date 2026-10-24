// Automatic download of media, as Telegram Desktop's Settings → Advanced →
// Automatic media download has it (R-Y181; learned, never copied): for
// private chats, groups and channels separately — photos on or off, videos
// up to some MB, files up to some MB, voice and round messages on or off —
// plus "Autoplay GIFs" and "Autoplay videos". Kept in this browser (they
// are the page's, not Telegram's). Media the choice does not allow is not
// loaded until the user asks: it shows a download button with its size.
// Pure functions, a small store the Settings and the messages share, and
// the hook the media views use.

import { createContext, useContext, useEffect, useState } from 'react';

export const AUTO_DOWNLOAD_KEY = 'metaSovereignAutoDownload';
export const SCOPES = Object.freeze(['users', 'chats', 'broadcasts']);

/** Sizes offered for "up to N MB" (0 means never). */
export const LIMITS_MB = Object.freeze([0, 1, 3, 10, 30, 100, 1000]);

const MB = 1024 * 1024;

export const DEFAULT_SCOPE = Object.freeze({
  photos: true,
  videoMb: 10,
  fileMb: 3,
  voice: true,
});

export const DEFAULTS = Object.freeze({
  users: DEFAULT_SCOPE,
  chats: DEFAULT_SCOPE,
  broadcasts: DEFAULT_SCOPE,
  autoplayGif: true,
  autoplayVideo: false,
});

const mb = (value, fallback) =>
  Number.isFinite(Number(value)) && Number(value) >= 0
    ? Math.min(4096, Number(value))
    : fallback;

const scopeFrom = (raw = {}) => ({
  photos: typeof raw.photos === 'boolean' ? raw.photos : DEFAULT_SCOPE.photos,
  videoMb: mb(raw.videoMb, DEFAULT_SCOPE.videoMb),
  fileMb: mb(raw.fileMb, DEFAULT_SCOPE.fileMb),
  voice: typeof raw.voice === 'boolean' ? raw.voice : DEFAULT_SCOPE.voice,
});

/** Settings from whatever was kept (anything wrong falls back). */
export const settingsFrom = (raw) => {
  const kept = raw && typeof raw === 'object' ? raw : {};
  return {
    users: scopeFrom(kept.users),
    chats: scopeFrom(kept.chats),
    broadcasts: scopeFrom(kept.broadcasts),
    autoplayGif:
      typeof kept.autoplayGif === 'boolean'
        ? kept.autoplayGif
        : DEFAULTS.autoplayGif,
    autoplayVideo:
      typeof kept.autoplayVideo === 'boolean'
        ? kept.autoplayVideo
        : DEFAULTS.autoplayVideo,
  };
};

export const readAutoDownload = (storage = globalThis.localStorage) => {
  try {
    return settingsFrom(JSON.parse(storage?.getItem(AUTO_DOWNLOAD_KEY)));
  } catch {
    return settingsFrom(null);
  }
};

export const writeAutoDownload = (
  settings,
  storage = globalThis.localStorage
) => {
  try {
    storage?.setItem(AUTO_DOWNLOAD_KEY, JSON.stringify(settings));
  } catch {
    // Private mode: the choice lasts for this page only.
  }
};

/** The settings with one scope's field (or a general one) changed. */
export const withChoice = (settings, scope, change) =>
  settingsFrom(
    scope
      ? { ...settings, [scope]: { ...settings[scope], ...change } }
      : { ...settings, ...change }
  );

// The offered size nearest to `bytes` (0 when there is none to download).
const nearestMb = (bytes) => {
  const wanted = Number(bytes) / MB;
  if (!(wanted > 0)) {
    return 0;
  }
  return LIMITS_MB.filter((n) => n > 0).reduce((best, n) =>
    Math.abs(n - wanted) < Math.abs(best - wanted) ? n : best
  );
};

/**
 * The page's settings for Telegram's automatic-download preset (`medium`
 * of account.getAutoDownloadSettings, as the server answers it: `{
 * disabled, photoMax, videoMax, fileMax }` in bytes), the same for the
 * three kinds of chat; anything unusable gives the defaults (R-Y215).
 */
export const settingsFromPreset = (preset) => {
  if (!preset || typeof preset !== 'object') {
    return settingsFrom(null);
  }
  const off = preset.disabled === true;
  const row = {
    photos: !off && Number(preset.photoMax) > 0,
    videoMb: off ? 0 : nearestMb(preset.videoMax),
    fileMb: off ? 0 : nearestMb(preset.fileMax),
    voice: !off,
  };
  return settingsFrom({
    users: row,
    chats: row,
    broadcasts: row,
    autoplayGif: DEFAULTS.autoplayGif,
    autoplayVideo: DEFAULTS.autoplayVideo,
  });
};

/** The scope Telegram's settings file a chat kind under. */
export const scopeOfKind = (kind) => {
  if (kind === 'channel') {
    return 'broadcasts';
  }
  return kind === 'group' ? 'chats' : 'users';
};

/**
 * Whether media of `type` ('photo', 'video', 'voice', 'file') of `bytes`
 * is fetched at once in `scope`.
 */
export const allowedFor = (settings, scope, type, bytes = 0) => {
  const row = settings[scope] ?? DEFAULT_SCOPE;
  const limit = (limitMb) =>
    limitMb > 0 && (!(bytes > 0) || bytes <= limitMb * MB);
  if (type === 'photo') {
    return row.photos;
  }
  if (type === 'voice') {
    return row.voice;
  }
  return limit(type === 'video' ? row.videoMb : row.fileMb);
};

// --- The store ------------------------------------------------------------

let current = null;
const listeners = new Set();

export const getAutoDownload = () => {
  current ??= readAutoDownload();
  return current;
};

export const setAutoDownload = (next) => {
  current = settingsFrom(next);
  writeAutoDownload(current);
  for (const listener of listeners) {
    listener(current);
  }
};

/** Forgets the held settings, to read them again (a test). */
export const resetAutoDownload = () => {
  current = null;
};

export const subscribeAutoDownload = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** The settings, following changes. */
export const useAutoDownloadSettings = () => {
  const [settings, setSettings] = useState(getAutoDownload);
  useEffect(() => subscribeAutoDownload(setSettings), []);
  return settings;
};

/** The kind of the chat the messages are in ('private' when not given). */
export const ChatKindContext = createContext('private');

/**
 * What a media view asks: `allowed` (fetch it now), `ask()` (the user asked
 * for it), and the autoplay choices.
 */
export const useAutoLoad = (type, bytes = 0) => {
  const settings = useAutoDownloadSettings();
  const scope = scopeOfKind(useContext(ChatKindContext));
  const [asked, setAsked] = useState(false);
  const auto = allowedFor(settings, scope, type, bytes);
  return {
    allowed: auto || asked,
    auto,
    ask: () => setAsked(true),
    autoplayGif: settings.autoplayGif,
    autoplayVideo: settings.autoplayVideo,
  };
};
