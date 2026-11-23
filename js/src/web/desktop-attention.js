import { useEffect, useState } from 'react';
import { NOTIFY_KEY, notifyAllowed, readPref } from './chat-notify.js';
import { SOUND_KEY } from './notify-sound.js';

const EVENT = 'meta-sovereign:notification-preference';
const bridge = () => globalThis.metaSovereignShell?.ownerAttention;
const browser = Object.freeze({ visual: false, audio: false });

export const refreshNotificationPreference = () =>
  globalThis.dispatchEvent?.(new globalThis.Event(EVENT));

export const acknowledgeDesktopAttention = (item) =>
  bridge()
    ?.acknowledge(item)
    .catch(() => {});

/** The desktop runtime continues with these preferences if its window closes. */
export const useDesktopAttention = (api, locale, online) => {
  const [native, setNative] = useState(() => (bridge() ? null : browser));
  useEffect(() => {
    const desktop = bridge();
    if (!desktop || online === null) {
      return undefined;
    }
    const owner = new AbortController();
    const { signal } = owner;
    let generation = 0;
    const sync = async () => {
      const current = ++generation;
      let answer;
      try {
        const local =
          online && (await api.serverOrigin()) === globalThis.location.origin;
        if (signal.aborted || generation !== current) {
          return;
        }
        answer = await desktop.configure({
          enabled: Boolean(
            local && notifyAllowed() && readPref(NOTIFY_KEY, true)
          ),
          sound: Boolean(local && readPref(SOUND_KEY, true)),
          locale,
        });
      } catch {
        // Unsupported native notifications use the existing web capability.
      }
      if (!signal.aborted && generation === current) {
        const visual = answer?.visual === true;
        const audio = answer?.audio === true;
        setNative((previous) =>
          previous?.visual === visual && previous.audio === audio
            ? previous
            : { visual, audio }
        );
      }
    };
    globalThis.addEventListener(EVENT, sync, { signal });
    globalThis.addEventListener('focus', sync, { signal });
    globalThis.addEventListener('storage', sync, { signal });
    void sync();
    return () => owner.abort();
  }, [api, locale, online]);
  return native;
};
