import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ATTENTION_POLL_MS,
  ATTENTION_REMIND_MS,
  ATTENTION_ACKNOWLEDGED_MS,
  attentionNotification,
} from '../automation/attention-policy.js';
import { useT } from './i18n.js';
import { NOTIFY_KEY, notifyAllowed, readPref } from './chat-notify.js';
import { SOUND_KEY, playNotifySound } from './notify-sound.js';
import { acknowledgeDesktopAttention } from './desktop-attention.js';

const el = React.createElement;
const REFRESH = 'meta-sovereign:form-attention';
const FORM = {
  name: 'form',
  kind: 'captcha',
  event: REFRESH,
  capabilities: 'formsCapabilities',
  capability: 'reviewAttention',
  attention: 'formsReviewAttention',
  focus: 'formsFocusReview',
  waiting: 'forms.attention.waiting',
};
const APPLICATION = {
  name: 'application',
  kind: 'hh-application-verification',
  event: 'meta-sovereign:application-attention',
  capabilities: 'vacancyCapabilities',
  capability: 'applicationAttention',
  attention: 'vacancyApplicationAttention',
  focus: 'vacancyApplicationAttentionFocus',
  waiting: 'application.attention.waiting',
};
const LOGIN = {
  name: 'login',
  kind: 'hh-manual-login',
  event: 'meta-sovereign:job-login-attention',
  capabilities: 'vacancyCapabilities',
  capability: 'manualLoginAttention',
  attention: 'vacancyLoginAttention',
  focus: 'vacancyLoginAttentionFocus',
  waiting: 'jobLogin.attention.waiting',
};
const keyOf = ({ id, requestId, browserSlot }) =>
  JSON.stringify([id, requestId, browserSlot]);
const validWait = (item, source) =>
  item?.kind === source.kind &&
  ['id', 'requestId', 'browserSlot'].every(
    (field) => typeof item[field] === 'string' && item[field]
  ) &&
  Number.isFinite(Date.parse(item.expiresAt)) &&
  typeof item.focusAvailable === 'boolean';

const refresh = (event) =>
  globalThis.dispatchEvent?.(new globalThis.Event(event));
export const refreshFormAttention = () => refresh(REFRESH);
export const refreshLoginAttention = () => refresh(LOGIN.event);

const observe = (api, source, update) => {
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
      const result = await api[source.attention](signal);
      if (!signal.aborted) {
        update(
          result?.ok === true && Array.isArray(result.attention)
            ? result.attention.filter((item) => validWait(item, source))
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
      timer = globalThis.setTimeout(read, queued ? 0 : ATTENTION_POLL_MS);
      queued = false;
    }
  };
  api[source.capabilities]()
    .then((capabilities) => {
      if (!signal.aborted && capabilities?.[source.capability] === true) {
        globalThis.addEventListener(source.event, read, { signal });
        read();
      }
    })
    .catch(() => {});
  return () => {
    owner.abort();
    globalThis.clearTimeout(timer);
  };
};

const alertOwner = ({ api, item, source, t, show, native }) => {
  if (native?.audio === false && readPref(SOUND_KEY, true)) {
    playNotifySound(api, 'default').catch(() => {});
  }
  if (
    native?.visual !== false ||
    !readPref(NOTIFY_KEY, true) ||
    !notifyAllowed()
  ) {
    return () => {};
  }
  try {
    const note = new globalThis.Notification(t('appName'), {
      body: t(attentionNotification[source.kind]),
      tag: `${source.name}-attention-${keyOf(item)}`,
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
  source,
  t,
  resumeAt,
  now,
  shown,
  show,
  updateTime,
  native,
}) => {
  const { expiresAt, focusAvailable, id, requestId, browserSlot } = item;
  const expires = Date.parse(expiresAt);
  useEffect(() => {
    if (!shown || expires <= now) {
      return undefined;
    }
    const remaining =
      Math.min(expires, resumeAt > now ? resumeAt : now + ATTENTION_REMIND_MS) -
      Date.now();
    const clearAlert =
      resumeAt > now
        ? null
        : alertOwner({
            api,
            item: { id, requestId, browserSlot, focusAvailable },
            source,
            t,
            show,
            native,
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
    browserSlot,
    source,
    t,
    resumeAt,
    now,
    shown,
    show,
    updateTime,
    native,
  ]);
};

const AttentionItem = ({ api, item, available, source, t, native }) => {
  const { id, requestId, browserSlot, focusAvailable } = item;
  const [deferred, setDeferred] = useState({ resumeAt: 0, hideBanner: false });
  const [now, updateTime] = useState(Date.now);
  const [status, setStatus] = useState('');
  const focusing = useRef(false);
  const acknowledge = useCallback(
    (hideBanner) => {
      const at = Date.now();
      updateTime(at);
      setDeferred({ resumeAt: at + ATTENTION_ACKNOWLEDGED_MS, hideBanner });
      if (native?.visual || native?.audio) {
        void acknowledgeDesktopAttention({
          kind: source.kind,
          id,
          requestId,
          browserSlot,
        });
      }
    },
    [native, source, id, requestId, browserSlot]
  );
  const show = useCallback(async () => {
    if (focusing.current) {
      return;
    }
    focusing.current = true;
    setStatus('opening');
    try {
      const result = await api[source.focus]({ id, requestId, browserSlot });
      if (result?.ok === true) {
        acknowledge(false);
        setStatus('');
      } else {
        setStatus('focusFailed');
      }
    } catch {
      setStatus('focusFailed');
    } finally {
      focusing.current = false;
      refresh(source.event);
    }
  }, [api, id, requestId, browserSlot, source, acknowledge]);
  useNoticeTimer({
    api,
    item,
    source,
    t,
    resumeAt: deferred.resumeAt,
    now,
    shown: available,
    show,
    updateTime,
    native,
  });
  if (
    !available ||
    (deferred.hideBanner && deferred.resumeAt > now) ||
    Date.parse(item.expiresAt) <= now
  ) {
    return null;
  }
  return el(
    'aside',
    {
      className: 'disk-banner form-attention',
      [`data-${source.name}-attention`]: browserSlot,
    },
    [
      el(
        'span',
        { key: 'message', role: 'status' },
        t(source.waiting, { slot: browserSlot })
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
                'data-action': `${source.name}-attention-focus`,
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
            'data-action': `${source.name}-attention-later`,
            onClick: () => acknowledge(true),
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

const OwnerAttention = ({ api, source, native }) => {
  const t = useT();
  const [items, setItems] = useState([]);
  const [available, setAvailable] = useState(false);
  useEffect(
    () =>
      observe(api, source, (next) => {
        setAvailable(next !== null);
        if (next !== null) {
          setItems(next);
        }
      }),
    [api, source]
  );
  return items.map((item) =>
    el(AttentionItem, {
      key: keyOf(item),
      api,
      item,
      available,
      source,
      t,
      native,
    })
  );
};

export const OwnerAttentionNotices = ({ api, native }) =>
  [FORM, APPLICATION, LOGIN].map((source) =>
    el(OwnerAttention, { key: source.kind, api, source, native })
  );
