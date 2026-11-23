import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useT } from './i18n.js';
import { NOTIFY_KEY, notifyAllowed, readPref } from './chat-notify.js';
import { SOUND_KEY, playNotifySound } from './notify-sound.js';

const el = React.createElement;
const REMIND_MS = 5 * 60_000;
const LATER_MS = 15 * 60_000;
const REFRESH = 'meta-sovereign:form-attention';
const keyOf = ({ id, requestId }) => JSON.stringify([id, requestId]);
const validWait = (item) =>
  item?.kind === 'captcha' &&
  ['id', 'requestId', 'browserSlot'].every(
    (field) => typeof item[field] === 'string' && item[field]
  ) &&
  Number.isFinite(Date.parse(item.expiresAt)) &&
  typeof item.focusAvailable === 'boolean';

export const refreshFormAttention = () =>
  globalThis.dispatchEvent?.(new globalThis.Event(REFRESH));

const observe = (api, update) => {
  const owner = new AbortController();
  const { signal } = owner;
  let timer;
  let reading = false;
  let queued = false;
  const read = async () => {
    if (reading) {
      queued = true;
      return;
    }
    reading = true;
    globalThis.clearTimeout(timer);
    try {
      const result = await api.formsReviewAttention(signal);
      if (!signal.aborted) {
        update(
          result?.ok === true && Array.isArray(result.attention)
            ? result.attention.filter(validWait)
            : null
        );
      }
    } catch {
      if (!signal.aborted) {
        update(null);
      }
    } finally {
      reading = false;
    }
    if (!signal.aborted) {
      timer = globalThis.setTimeout(read, queued ? 0 : 6000);
      queued = false;
    }
  };
  api
    .formsCapabilities()
    .then((capabilities) => {
      if (!signal.aborted && capabilities?.reviewAttention === true) {
        globalThis.addEventListener(REFRESH, read, { signal });
        read();
      }
    })
    .catch(() => {});
  return () => {
    owner.abort();
    globalThis.clearTimeout(timer);
  };
};

const alertOwner = ({ api, item, t, show }) => {
  if (readPref(SOUND_KEY, true)) {
    playNotifySound(api, 'default').catch(() => {});
  }
  if (!readPref(NOTIFY_KEY, true) || !notifyAllowed()) {
    return () => {};
  }
  try {
    const note = new globalThis.Notification(t('appName'), {
      body: t('forms.attention.notification'),
      tag: `forms-attention-${keyOf(item)}`,
      silent: true,
    });
    note.onclick = () => {
      globalThis.focus?.();
      note.close();
      if (item.focusAvailable) {
        show();
      }
    };
    return () => {
      note.onclick = null;
      note.close();
    };
  } catch {
    return () => {};
  }
};

const useNoticeTimer = ({
  api,
  item,
  t,
  later,
  now,
  shown,
  show,
  updateTime,
}) => {
  const { expiresAt, focusAvailable, id, requestId } = item;
  const expires = Date.parse(expiresAt);
  useEffect(() => {
    if (!shown || expires <= now) {
      return undefined;
    }
    const remaining =
      Math.min(expires, later > now ? later : now + REMIND_MS) - Date.now();
    const clearAlert =
      later > now
        ? null
        : alertOwner({
            api,
            item: { id, requestId, focusAvailable },
            t,
            show,
          });
    const timer = globalThis.setTimeout(
      () => updateTime(Date.now()),
      Math.max(1, remaining)
    );
    return () => {
      clearAlert?.();
      globalThis.clearTimeout(timer);
    };
  }, [
    api,
    expires,
    focusAvailable,
    id,
    requestId,
    t,
    later,
    now,
    shown,
    show,
    updateTime,
  ]);
};

const AttentionItem = ({ api, item, available, t }) => {
  const { id, requestId, browserSlot, focusAvailable } = item;
  const [later, setLater] = useState(0);
  const [now, updateTime] = useState(Date.now);
  const [status, setStatus] = useState('');
  const focusing = useRef(false);
  const show = useCallback(async () => {
    if (focusing.current) {
      return;
    }
    focusing.current = true;
    setStatus('opening');
    try {
      const result = await api.formsFocusReview({ id, requestId });
      setStatus(result?.ok === true ? '' : 'focusFailed');
    } catch {
      setStatus('focusFailed');
    } finally {
      focusing.current = false;
      refreshFormAttention();
    }
  }, [api, id, requestId]);
  useNoticeTimer({
    api,
    item,
    t,
    later,
    now,
    shown: available,
    show,
    updateTime,
  });
  if (!available || later > now || Date.parse(item.expiresAt) <= now) {
    return null;
  }
  return el(
    'aside',
    {
      className: 'disk-banner form-attention',
      'data-form-attention': browserSlot,
    },
    [
      el(
        'span',
        { key: 'message', role: 'status' },
        t('forms.attention.waiting', { slot: browserSlot })
      ),
      !focusAvailable
        ? el(
            'span',
            { key: 'unavailable', className: 'meta' },
            t('forms.attention.focusUnavailable')
          )
        : null,
      el('div', { key: 'actions', className: 'form-attention-actions' }, [
        focusAvailable
          ? el(
              'button',
              {
                key: 'focus',
                type: 'button',
                'data-action': 'form-attention-focus',
                'aria-busy': status === 'opening',
                disabled: status === 'opening',
                onClick: show,
              },
              t('forms.attention.show')
            )
          : null,
        el(
          'button',
          {
            key: 'later',
            type: 'button',
            'data-action': 'form-attention-later',
            onClick: () => {
              const at = Date.now();
              updateTime(at);
              setLater(at + LATER_MS);
            },
          },
          t('forms.attention.later')
        ),
      ]),
      status === 'focusFailed'
        ? el(
            'span',
            { className: 'form-attention-error', key: 'error', role: 'alert' },
            t('forms.attention.focusFailed')
          )
        : null,
    ]
  );
};

export const FormAttention = ({ api }) => {
  const t = useT();
  const [items, setItems] = useState([]);
  const [available, setAvailable] = useState(false);
  useEffect(
    () =>
      observe(api, (next) => {
        setAvailable(next !== null);
        if (next !== null) {
          setItems(next);
        }
      }),
    [api]
  );
  return items.map((item) =>
    el(AttentionItem, { key: keyOf(item), api, item, available, t })
  );
};
