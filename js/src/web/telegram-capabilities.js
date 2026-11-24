import { openServerEvents } from './server-events.js';
import { decodeWire, LINO_LINE } from '../transport/lino.js';
import { debugBrowser } from './client-log.js';

// Absent flags remain compatible with older servers. A transient failure is
// unknown, whereas an explicit false is an authoritative capability change.
export const telegramFeatureAvailable = (status, feature) =>
  Boolean(status && !status.offline && !status.error) &&
  status.available !== false &&
  status.capabilities?.[feature] !== false;

export const followTelegramAccountEvents = ({
  readStatus,
  open,
  clock = globalThis,
  signal,
  everyMs = 15000,
}) => {
  let stopped = Boolean(signal?.aborted);
  let timer = null;
  let close = null;
  let advertised = null;
  const check = async () => {
    if (stopped) {
      return;
    }
    const status = await Promise.resolve()
      .then(readStatus)
      .catch(() => null);
    if (stopped) {
      return;
    }
    if (status && !status.offline && !status.error) {
      const available = telegramFeatureAvailable(status, 'accountEvents');
      if (available !== advertised) {
        advertised = available;
        debugBrowser('telegram-capability', {
          feature: 'accountEvents',
          available,
        });
      }
      if (available) {
        try {
          close ??= open();
        } catch {
          debugBrowser('telegram-events-open-failed', { retry: true });
        }
      } else {
        close?.();
        close = null;
      }
    }
    timer = clock.setTimeout(check, everyMs);
    timer?.unref?.();
  };
  const stop = () => {
    stopped = true;
    clock.clearTimeout(timer);
    close?.();
    close = null;
    signal?.removeEventListener('abort', stop);
  };
  if (!stopped) {
    signal?.addEventListener('abort', stop, { once: true });
    timer = clock.setTimeout(check, 0);
    timer?.unref?.();
  }
  return stop;
};

export const openTelegramAccountEvents = (
  origin,
  onEvent,
  { readStatus, Source = globalThis.EventSource, signal } = {}
) => {
  if (!origin || typeof Source !== 'function') {
    return () => {};
  }
  return followTelegramAccountEvents({
    readStatus,
    signal,
    open: () =>
      openServerEvents(
        new URL(
          '/api/telegram/accounts-events?format=lino-line',
          origin
        ).toString(),
        {
          message: (event) => {
            try {
              onEvent(decodeWire(event.data, LINO_LINE));
            } catch {
              // Skip malformed frames; subsequent refreshes catch up.
            }
          },
        },
        { Source, signal }
      ),
  });
};
