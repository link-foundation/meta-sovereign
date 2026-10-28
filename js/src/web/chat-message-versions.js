// Saved history uses only the local server, including after upstream deletion.
import React, { useEffect, useRef, useState } from 'react';
import { useDates, useT } from './i18n.js';
import { Frame } from './chat-readers.js';
import { PageLoading, Spinner } from './spinner.js';
import { LoadingImage, LoadingPlayer } from './media-loading.js';
import { mediaSrc, saveUrl } from './media-src.js';
import { createRetryingRead } from './read-retry.js';
import { MessageText } from './message-text.js';

const el = React.createElement;
const usePages = (ask, key, field) => {
  const latest = useRef(ask);
  latest.current = ask;
  const [state, setState] = useState({ key: null, items: [], loading: true });
  const cursor = useRef(null);
  const reader = useRef(null);
  useEffect(() => {
    cursor.current = null;
    setState({ key, items: [], loading: true });
    const read = createRetryingRead(() => latest.current(cursor.current), {
      accept: (answer) =>
        setState((before) => ({
          key,
          loading: false,
          count: answer?.count ?? 0,
          partial: answer?.partial,
          items: [
            ...new Map(
              [
                ...(cursor.current ? before.items : []),
                ...(answer?.[field] ?? []),
              ].map((item) => [item.id ?? item.messageId, item])
            ).values(),
          ],
          next: answer?.next ?? null,
        })),
      failed: () => {},
    });
    reader.current = read;
    read.refresh();
    return () => read.stop();
  }, [key, field]);
  return [
    state.key === key ? state : { items: [], loading: true },
    () => {
      if (!state.next || state.loading) {
        return;
      }
      cursor.current = state.next;
      setState((before) => ({ ...before, loading: true }));
      reader.current.refresh();
    },
  ];
};
const More = ({ next, loading, load }) => {
  const ref = useRef(null);
  const latest = useRef(load);
  latest.current = load;
  useEffect(() => {
    if (!next || loading || !globalThis.IntersectionObserver) {
      return undefined;
    }
    const observer = new globalThis.IntersectionObserver(
      (items) => {
        if (items.some((item) => item.isIntersecting)) {
          latest.current();
        }
      },
      { root: ref.current?.closest('.reader-body'), rootMargin: '150px' }
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [next, loading]);
  return el(
    'div',
    { ref, className: 'version-more' },
    loading ? el(Spinner) : null
  );
};
const Asset = ({ api, asset }) => {
  const t = useT();
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let active = true;
    const read = createRetryingRead(() => api.versionMediaUrl?.(asset), {
      accept: (value) => active && setUrl(value),
      failed: () => {},
    });
    read.refresh();
    return () => {
      active = false;
      read.stop();
    };
  }, [api, asset.path]);
  if (!url) {
    return el(Spinner);
  }
  return el('div', { className: 'version-asset' }, [
    asset.mimeType?.startsWith('image/')
      ? el(LoadingImage, {
          key: 'p',
          ...mediaSrc(url),
          alt: t('chat.versions.attachment'),
        })
      : null,
    /^(audio|video)\//.test(asset.mimeType ?? '')
      ? el(LoadingPlayer, {
          key: 'v',
          as: asset.mimeType.startsWith('audio/') ? 'audio' : 'video',
          ...mediaSrc(url),
          controls: true,
          preload: 'metadata',
        })
      : null,
    el(
      'button',
      {
        key: 'd',
        type: 'button',
        className: 'button',
        onClick: () => saveUrl(url, asset.name),
      },
      t('chat.versions.download')
    ),
  ]);
};
const versionText = (record) => ({
  text: record.snapshot?.body,
  entities: record.snapshot?.raw?.entities ?? record.snapshot?.entities ?? [],
});
const Version = ({ record, number, api }) => {
  const dates = useDates();
  const t = useT();
  return el(
    'article',
    { className: 'message-version', 'data-version': record.id ?? 'current' },
    [
      el('strong', { key: 'n' }, t('chat.versions.number', { number })),
      record.capturedAt
        ? el(
            'span',
            { key: 'd', className: 'meta' },
            t('chat.versions.savedAt', {
              when: dates.dateTime(record.capturedAt),
            })
          )
        : null,
      el(
        'div',
        { key: 'b', className: 'version-body' },
        el(MessageText, {
          ...versionText(record),
          text: versionText(record).text || t('chat.versions.attachment'),
        })
      ),
      ...(record.assets ?? []).map((asset) =>
        el(Asset, { key: asset.path, api, asset })
      ),
      record.snapshot?.raw?.media && !record.assets?.length
        ? el(
            'p',
            { key: 'u', className: 'meta' },
            t('chat.versions.mediaMissing')
          )
        : null,
    ]
  );
};
export const MessageVersionsDialog = ({ api, message, close }) => {
  const t = useT();
  const [state, more] = usePages(
    async (before) =>
      (await api.messageVersions?.(message.id, before)) ?? {
        versions: [{ messageId: message.id, snapshot: message }],
        count: 1,
        partial: true,
      },
    `${message.id}:${message.versionHead ?? ''}`,
    'versions'
  );
  return el(
    Frame,
    { title: t('chat.versions.title'), name: 'message-versions', close },
    [
      el('p', { key: 'i', className: 'meta' }, t('chat.versions.local')),
      state.partial
        ? el('p', { key: 'p', className: 'meta' }, t('chat.versions.partial'))
        : null,
      !state.loading && !state.items.length
        ? el('p', { key: 'e', className: 'meta' }, t('chat.versions.empty'))
        : null,
      state.loading && !state.items.length
        ? el(PageLoading, { key: 'l' })
        : null,
      ...state.items.map((record, index) =>
        el(Version, {
          key: record.id ?? record.messageId,
          record,
          api,
          number: (state.count ?? 1) - index,
        })
      ),
      el(More, {
        key: 'more',
        next: state.next,
        loading: state.loading && state.items.length > 0,
        load: more,
      }),
    ]
  );
};
export const useMessageVersions = (api, chatKey) => {
  const [message, setMessage] = useState(null);
  useEffect(() => setMessage(null), [api, chatKey]);
  return {
    open: setMessage,
    dialog: message
      ? el(MessageVersionsDialog, {
          key: message.id,
          api,
          message,
          close: () => setMessage(null),
        })
      : null,
  };
};
const EditedList = ({ api, chatKey, close }) => {
  const t = useT();
  const [state, more] = usePages(
    (before) => api.editedMessages(chatKey, { before }),
    chatKey,
    'messages'
  );
  const versions = useMessageVersions(api, chatKey);
  if (versions.dialog) {
    return versions.dialog;
  }
  return el(
    Frame,
    { title: t('chat.versions.edited'), name: 'edited-messages', close },
    [
      state.loading && !state.items.length
        ? el(PageLoading, { key: 'l' })
        : null,
      ...state.items.map((message) =>
        el(
          'button',
          {
            key: message.id,
            type: 'button',
            className: 'edited-message-row',
            'data-edited-id': message.id,
            onClick: () => versions.open(message),
          },
          [
            el(
              'strong',
              { key: 's' },
              message.senderName ?? message.sender ?? ''
            ),
            el(
              'span',
              { key: 'b' },
              message.body || t('chat.versions.attachment')
            ),
            el(
              'span',
              { key: 'c', className: 'meta' },
              t('chat.versions.count', { count: message.versionCount })
            ),
          ]
        )
      ),
      el(More, {
        key: 'more',
        next: state.next,
        loading: state.loading && state.items.length > 0,
        load: more,
      }),
    ]
  );
};
export const EditedBar = ({ api, state }) => {
  const t = useT();
  const key = state.current?.key;
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!key || !api.editedMessages) {
      return undefined;
    }
    const read = createRetryingRead(
      () => api.editedMessages(key, { count: true }),
      { accept: (answer) => setCount(answer?.count ?? 0), failed: () => {} }
    );
    read.refresh();
    return () => read.stop();
  }, [api, key, state.messages]);
  useEffect(() => setOpen(false), [key]);
  return count || open
    ? el('div', { className: 'chat-deleted-bar', 'data-bar': 'edited' }, [
        el('span', { key: 'c' }, t('chat.versions.bar', { count })),
        el(
          'button',
          {
            key: 'b',
            type: 'button',
            className: 'button',
            'data-action': 'edited-open',
            onClick: () => setOpen(true),
          },
          t('chat.deleted.view')
        ),
        open
          ? el(EditedList, {
              key,
              api,
              chatKey: key,
              close: () => setOpen(false),
            })
          : null,
      ])
    : null;
};
