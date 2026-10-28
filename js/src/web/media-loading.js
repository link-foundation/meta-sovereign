import React, { useEffect, useRef, useState } from 'react';
import { useT } from './i18n.js';
import { Spinner } from './spinner.js';
import { READ_RECOVERED_EVENT } from './read-retry.js';

const el = React.createElement;

// URL resolution and byte decoding are separate stages: a URL is not a loaded
// image or a playable video. Keep the marker until the browser confirms it.
export const useMediaSource = (api, method, args, enabled) => {
  const [result, setResult] = useState({ key: null, url: null, failed: false });
  const [attempt, retry] = useState(0);
  const key = JSON.stringify([method, args, attempt]);
  useEffect(() => {
    if (!enabled || typeof api?.[method] !== 'function' || !args.chat) {
      return undefined;
    }
    let active = true;
    Promise.resolve()
      .then(() => api[method](args))
      .then(
        (url) =>
          active &&
          setResult({
            key,
            url:
              url && attempt
                ? `${url}${url.includes('?') ? '&' : '?'}retry=${attempt}`
                : (url ?? null),
            failed: !url,
          }),
        () => active && setResult({ key, url: null, failed: true })
      );
    return () => {
      active = false;
    };
  }, [api, key, enabled]);
  return {
    url: result.key === key ? result.url : null,
    failed: result.key === key && result.failed,
    retry: () => retry((value) => value + 1),
  };
};

export const useMediaReady = (src) => {
  const [settled, setSettled] = useState({ src: null, phase: 'loading' });
  const element = useRef(null);
  const attempt = useRef(0);
  const phase = settled.src === src ? settled.phase : 'loading';
  const set = (value) => setSettled({ src, phase: value });
  return {
    ready: Boolean(src) && phase === 'ready',
    failed: Boolean(src) && phase === 'failed',
    retry: () => {
      const node = element.current;
      if (!node || !src) {
        return;
      }
      set('loading');
      attempt.current += 1;
      node.src = /^(blob:|data:)/.test(src)
        ? src
        : `${src}${src.includes('?') ? '&' : '?'}mediaRetry=${attempt.current}`;
    },
    handlers: {
      onLoad: () => set('ready'),
      onLoadedData: () => set('ready'),
      onCanPlay: () => set('ready'),
      onPlaying: () => set('ready'),
      onWaiting: () => set('loading'),
      onError: (event) => {
        element.current = event?.currentTarget;
        set('failed');
      },
    },
  };
};

export const useMediaRetry = (active, failed, retry) => {
  const latest = useRef(retry);
  const attempts = useRef(0);
  latest.current = retry;
  useEffect(() => {
    if (!active && !failed) {
      attempts.current = 0;
    }
    if (!failed || !latest.current) {
      return undefined;
    }
    let pending = true;
    const run = () => {
      if (!pending) {
        return;
      }
      pending = false;
      latest.current?.();
    };
    const timer = globalThis.setTimeout(
      run,
      [1000, 2000, 5000, 10000, 30000][Math.min(attempts.current++, 4)]
    );
    globalThis.addEventListener?.(READ_RECOVERED_EVENT, run);
    globalThis.addEventListener?.('online', run);
    return () => {
      pending = false;
      globalThis.clearTimeout(timer);
      globalThis.removeEventListener?.(READ_RECOVERED_EVENT, run);
      globalThis.removeEventListener?.('online', run);
    };
  }, [active, failed]);
};

export const MediaLoading = ({
  active,
  failed = false,
  retry,
  small = false,
}) => {
  const t = useT();
  useMediaRetry(active, failed, retry);
  if (!active && !failed) {
    return null;
  }
  const label = t('common.loading');
  return el(
    'span',
    {
      className: `media-loading${small ? ' is-small' : ''}`,
      role: 'status',
      'aria-label': label,
      'data-media-loading': 'loading',
    },
    el(Spinner, { size: small ? 'small' : 'large' })
  );
};

// A decoded image in a stable box, shared by imported/remote pictures and
// previews. The parent supplies known dimensions when it has them.
export const LoadingImage = ({
  src,
  className = '',
  compact = false,
  showProgress = true,
  onLoad,
  onError,
  ...props
}) => {
  const state = useMediaReady(src);
  useMediaRetry(!state.ready, state.failed && !showProgress, state.retry);
  return el(
    'span',
    {
      className: `loading-image${compact ? ' is-compact' : ''} ${className}`,
      'aria-busy': !state.ready && !state.failed,
    },
    [
      el('img', {
        ...props,
        key: 'image',
        src,
        className,
        'data-media-ready': state.ready ? 'true' : 'false',
        onLoad: (event) => {
          state.handlers.onLoad(event);
          onLoad?.(event);
        },
        onError: (event) => {
          state.handlers.onError(event);
          onError?.(event);
        },
      }),
      showProgress
        ? el(MediaLoading, {
            key: 'loading',
            active: !state.ready,
            failed: state.failed,
            retry: state.retry,
          })
        : null,
    ]
  );
};

export const LoadingPlayer = ({ as = 'video', src, onError, ...props }) => {
  const state = useMediaReady(src);
  const [started, setStarted] = useState(props.preload !== 'none');
  return el('span', { className: `loading-player loading-${as}` }, [
    el(as, {
      ...props,
      ...state.handlers,
      key: 'player',
      src,
      onLoadStart: () => props.preload !== 'none' && setStarted(true),
      onPlay: () => setStarted(true),
      onError: (event) => {
        state.handlers.onError(event);
        onError?.(event);
      },
    }),
    el(MediaLoading, {
      key: 'loading',
      active: started && !state.ready,
      failed: state.failed,
      retry: state.retry,
    }),
  ]);
};
