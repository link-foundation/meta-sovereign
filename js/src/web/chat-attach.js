// Sending files and photos, as Telegram's apps do it (R-Y99; Telegram
// Desktop's send box, learned, never copied): the paperclip by the
// message box, a picture pasted into it, or files dropped on the chat
// open a box with what will go — pictures shown, other files by name and
// size — a caption (the box's text, taken along), "Compress images"
// (pictures as photos, else as files) and "Group items" (albums); Send
// uploads them, showing how far, and Telegram gets them together.

import React, { useEffect, useRef, useState } from 'react';
import { useT } from './i18n.js';
import { Icon } from './icons.js';

const el = React.createElement;

const PICTURE = /^image\/(jpeg|png|gif|webp|bmp|heic|heif)$/i;

export const isPicture = (file) => PICTURE.test(String(file?.type ?? ''));

/** "12 KB", "3.4 MB": a file's size as Telegram's apps write it. */
export const sizeText = (bytes) => {
  const n = Number(bytes) || 0;
  if (n < 1024) {
    return `${n} B`;
  }
  const units = ['KB', 'MB', 'GB'];
  let value = n / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
};

const filesOf = (list) => Array.from(list ?? []).filter(Boolean);

const previewOf = (file) => ({
  file,
  url:
    isPicture(file) && typeof globalThis.URL?.createObjectURL === 'function'
      ? globalThis.URL.createObjectURL(file)
      : null,
});

const forget = (items) =>
  items.forEach(
    (item) => item.url && globalThis.URL?.revokeObjectURL?.(item.url)
  );

/** Can this chat take files: a Telegram chat of a user account. */
export const canAttach = (state, api) =>
  state.current?.source === 'telegram' &&
  state.telegram?.kind === 'user' &&
  typeof api?.telegramUpload === 'function';

// Each file up, then all of them to Telegram; `onProgress(0…1)` overall.
const upload = async (api, items, onProgress) => {
  const total = items.reduce((sum, item) => sum + (item.file.size || 1), 0);
  let done = 0;
  const tokens = [];
  for (const item of items) {
    const size = item.file.size || 1;
    const answer = await api.telegramUpload(item.file, {
      onProgress: (part) => onProgress((done + part * size) / total),
    });
    if (!answer?.token) {
      return { error: answer?.error ?? 'upload failed', code: answer?.code };
    }
    done += size;
    onProgress(done / total);
    tokens.push(answer.token);
  }
  return { tokens };
};

// The message the files answer, when one is chosen.
const replyOf = (composer) =>
  composer?.replyTo?.msgId ? { replyTo: composer.replyTo.msgId } : {};

/**
 * The send box's state: `{ items, caption, asPhoto, group, progress,
 * add, remove, setCaption, setAsPhoto, setGroup, send, close }`.
 */
export const useAttach = ({ state, api }) => {
  const { composer, current } = state;
  const [items, setItems] = useState([]);
  const [caption, setCaption] = useState('');
  const [asPhoto, setAsPhoto] = useState(true);
  const [group, setGroup] = useState(true);
  const [progress, setProgress] = useState(null);
  const held = useRef(items);
  held.current = items;
  const enabled = canAttach(state, api);

  const close = () => {
    forget(held.current);
    setItems([]);
    setProgress(null);
  };
  useEffect(() => close, [current?.key]);

  const add = (list) => {
    const files = filesOf(list);
    if (!enabled || files.length === 0) {
      return false;
    }
    if (held.current.length === 0) {
      // The box's text goes along as the caption, as in Desktop.
      setCaption(String(composer?.text ?? ''));
    }
    setItems((now) => [...now, ...files.map(previewOf)]);
    return true;
  };

  const remove = (index) =>
    setItems((now) => {
      forget(now.slice(index, index + 1));
      return now.filter((_, i) => i !== index);
    });

  const send = async () => {
    const chosen = held.current;
    if (chosen.length === 0 || progress !== null) {
      return;
    }
    setProgress(0);
    const up = await upload(api, chosen, setProgress);
    const answer = up.tokens
      ? await api.telegramSendFiles({
          chat: String(current.chat),
          tokens: up.tokens,
          caption: caption.trim(),
          asPhoto,
          group,
          ...replyOf(composer),
        })
      : up;
    if (answer?.ok) {
      composer?.setText?.('');
      composer?.clearReplyTo?.();
      close();
      return;
    }
    setProgress(null);
    state.notify?.({
      kind: 'failed',
      code: answer?.code,
      error: answer?.error ?? 'not sent',
      retryAfter: answer?.retryAfter,
    });
  };

  return {
    enabled,
    items,
    caption,
    asPhoto,
    group,
    progress,
    add,
    remove,
    setCaption,
    setAsPhoto,
    setGroup,
    send,
    close,
  };
};

// Files dropped anywhere on the open chat go to the send box.
export const useDropFiles = (attach) => {
  const [over, setOver] = useState(false);
  const latest = useRef(attach);
  latest.current = attach;
  useEffect(() => {
    if (!attach.enabled) {
      return undefined;
    }
    const inChat = (event) =>
      Boolean(event.target?.closest?.('.chat-main')) &&
      Array.from(event.dataTransfer?.types ?? []).includes('Files');
    const onOver = (event) => {
      if (inChat(event)) {
        event.preventDefault();
        setOver(true);
      }
    };
    const onLeave = (event) => {
      if (!event.relatedTarget) {
        setOver(false);
      }
    };
    const onDrop = (event) => {
      setOver(false);
      if (inChat(event)) {
        event.preventDefault();
        latest.current.add(event.dataTransfer.files);
      }
    };
    const doc = globalThis.document;
    doc?.addEventListener('dragover', onOver);
    doc?.addEventListener('dragleave', onLeave);
    doc?.addEventListener('drop', onDrop);
    return () => {
      doc?.removeEventListener('dragover', onOver);
      doc?.removeEventListener('dragleave', onLeave);
      doc?.removeEventListener('drop', onDrop);
    };
  }, [attach.enabled]);
  return over;
};

/** A picture pasted into the message box goes to the send box. */
export const pasteFiles = (attach) => (event) => {
  const files = filesOf(event.clipboardData?.files);
  if (files.length > 0 && attach.add(files)) {
    event.preventDefault();
  }
};

/** The paperclip by the message box. */
export const AttachButton = ({ attach }) => {
  const t = useT();
  const input = useRef(null);
  if (!attach.enabled) {
    return null;
  }
  return el('span', { className: 'chat-attach' }, [
    el(
      'button',
      {
        key: 'b',
        type: 'button',
        className: 'chat-attach-btn icon-btn',
        'data-action': 'attach',
        'aria-label': t('chat.attach.button'),
        title: t('chat.attach.button'),
        onClick: () => input.current?.click(),
      },
      el(Icon, { name: 'paperclip', size: 20 })
    ),
    el('input', {
      key: 'i',
      ref: input,
      type: 'file',
      multiple: true,
      hidden: true,
      className: 'chat-attach-input',
      onChange: (event) => {
        attach.add(event.target.files);
        event.target.value = '';
      },
    }),
  ]);
};

const titleOf = (t, items, asPhoto) => {
  const count = items.length;
  if (asPhoto && items.every((item) => isPicture(item.file))) {
    return t('chat.attach.titlePhotos', { count });
  }
  return t('chat.attach.titleFiles', { count });
};

const Item = ({ item, index, onRemove, t }) =>
  el('li', { className: 'attach-item', 'data-file': item.file.name }, [
    item.url
      ? el('img', { key: 'p', src: item.url, alt: '', className: 'attach-pic' })
      : el(
          'span',
          { key: 'p', className: 'attach-doc' },
          el(Icon, { name: 'file', size: 22 })
        ),
    el('span', { key: 'n', className: 'attach-name' }, [
      el('span', { key: 'a', className: 'attach-title' }, item.file.name),
      el(
        'span',
        { key: 'b', className: 'attach-size' },
        sizeText(item.file.size)
      ),
    ]),
    el(
      'button',
      {
        key: 'x',
        type: 'button',
        className: 'icon-btn attach-remove',
        'aria-label': t('chat.attach.remove'),
        title: t('chat.attach.remove'),
        onClick: () => onRemove(index),
      },
      el(Icon, { name: 'close', size: 16 })
    ),
  ]);

const Check = ({ name, checked, onChange, label }) =>
  el('label', { className: 'pin-dialog-option', 'data-option': name }, [
    el('input', {
      key: 'c',
      type: 'checkbox',
      checked,
      onChange: (e) => onChange(e.target.checked),
    }),
    el('span', { key: 'l' }, label),
  ]);

const Progress = ({ progress, t }) =>
  el('div', { className: 'attach-progress', role: 'status' }, [
    el(
      'div',
      { key: 'bar', className: 'attach-progress-bar' },
      el('span', { style: { width: `${Math.round(progress * 100)}%` } })
    ),
    el(
      'span',
      { key: 't', className: 'attach-progress-text' },
      t('chat.attach.sending', { percent: Math.round(progress * 100) })
    ),
  ]);

/** The send box: what goes, the caption, how, and Send. */
export const AttachDialog = ({ attach }) => {
  const t = useT();
  const more = useRef(null);
  const busy = attach.progress !== null;
  useEffect(() => {
    if (attach.items.length === 0) {
      return undefined;
    }
    const onKey = (e) => e.key === 'Escape' && !busy && attach.close();
    globalThis.addEventListener?.('keydown', onKey);
    return () => globalThis.removeEventListener?.('keydown', onKey);
  }, [attach.items.length, busy]);
  if (attach.items.length === 0) {
    return null;
  }
  const pictures = attach.items.some((item) => isPicture(item.file));
  return el(
    'div',
    {
      className: 'delete-dialog-overlay',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': titleOf(t, attach.items, attach.asPhoto),
    },
    el('div', { className: 'delete-dialog attach-dialog' }, [
      el('h3', { key: 'h' }, titleOf(t, attach.items, attach.asPhoto)),
      el(
        'ul',
        {
          key: 'l',
          // Photos as Desktop shows them: pictures, large; files listed.
          className:
            attach.asPhoto && attach.items.every((item) => item.url)
              ? 'attach-list is-photos'
              : 'attach-list',
        },
        attach.items.map((item, index) =>
          el(Item, {
            key: `${index}:${item.file.name}`,
            item,
            index,
            onRemove: attach.remove,
            t,
          })
        )
      ),
      pictures
        ? el(Check, {
            key: 'photo',
            name: 'compress',
            checked: attach.asPhoto,
            onChange: attach.setAsPhoto,
            label: t('chat.attach.compress'),
          })
        : null,
      attach.items.length > 1
        ? el(Check, {
            key: 'group',
            name: 'group',
            checked: attach.group,
            onChange: attach.setGroup,
            label: t('chat.attach.group'),
          })
        : null,
      el('textarea', {
        key: 'c',
        rows: 2,
        autoFocus: true,
        className: 'attach-caption',
        placeholder: t('chat.attach.caption'),
        'aria-label': t('chat.attach.caption'),
        value: attach.caption,
        disabled: busy,
        onChange: (e) => attach.setCaption(e.target.value),
        onKeyDown: (e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent?.isComposing) {
            e.preventDefault();
            attach.send();
          }
        },
      }),
      busy ? el(Progress, { key: 'p', progress: attach.progress, t }) : null,
      el('div', { key: 'btns', className: 'delete-dialog-btns' }, [
        el('input', {
          key: 'more-input',
          ref: more,
          type: 'file',
          multiple: true,
          hidden: true,
          onChange: (event) => {
            attach.add(event.target.files);
            event.target.value = '';
          },
        }),
        el(
          'button',
          {
            key: 'add',
            type: 'button',
            className: 'attach-add',
            disabled: busy,
            onClick: () => more.current?.click(),
          },
          t('chat.attach.add')
        ),
        el(
          'button',
          {
            key: 'cancel',
            type: 'button',
            disabled: busy,
            onClick: attach.close,
          },
          t('common.cancel')
        ),
        el(
          'button',
          {
            key: 'send',
            type: 'button',
            className: 'primary',
            'data-action': 'attach-send',
            disabled: busy,
            onClick: attach.send,
          },
          t('common.send')
        ),
      ]),
    ])
  );
};

/** Over the chat while files are dragged onto it. */
export const DropHint = ({ over }) => {
  const t = useT();
  return over
    ? el(
        'div',
        { className: 'chat-drop', 'aria-hidden': 'true' },
        el('span', {}, t('chat.attach.drop'))
      )
    : null;
};
