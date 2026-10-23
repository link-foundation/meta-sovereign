// Editing a message in the message box, as Telegram Desktop does it
// (R-Y146; learned, never copied): a bar over the box shows a pencil,
// "Edit message" and the message's text on one line, with × to cancel;
// the box takes the message's text (its formatting as markdown), the
// caret at the end; Enter or the check mark saves, Esc cancels, and the
// draft the user was typing comes back either way. A message with a
// file or picture has its caption edited (an empty one is allowed); a
// text message cannot be emptied.

import React, { useEffect, useRef, useState } from 'react';
import { useT } from './i18n.js';
import { Icon } from './icons.js';
import { mediaLabel } from './chat-message.js';
import { parseMessageParts } from './message-parts.js';
import { toMarkdown } from '../sources/telegram-format.js';

const el = React.createElement;

/** The message's text as one types it: formatting as markdown (R-Y101). */
export const editableText = (message) =>
  toMarkdown(parseMessageParts(message).text, message?.raw?.entities ?? []);

/** Whether the message carries a file or picture (its text is a caption). */
export const hasMedia = (message) => {
  const media = parseMessageParts(message).media;
  // A link's preview is no file: the message is text.
  return Boolean(media) && media.kind !== 'webpage';
};

/**
 * What saving the box's `text` does: 'close' (unchanged), 'ignore' (a text
 * message cannot be emptied: nothing happens) or 'save'.
 */
export const editOutcome = ({ message, text, before }) => {
  if (text === before) {
    return 'close';
  }
  return !text.trim() && !hasMedia(message) ? 'ignore' : 'save';
};

/**
 * The /api/message/edit body: a caption flag for a message with media
 * (an empty text is then allowed), the link preview's choice for text.
 */
export const editBody = ({ message, text, preview }) =>
  hasMedia(message)
    ? { ids: [message.id], text, caption: true }
    : { ids: [message.id], text, ...(preview ?? {}) };

/** The bar over the box while editing. */
export const EditBar = ({ message, onCancel }) => {
  const t = useT();
  const parts = parseMessageParts(message);
  const line = (
    parts.text.split('\n').find((l) => l.trim()) ??
    (parts.media ? mediaLabel(t, parts.media) : '') ??
    ''
  ).slice(0, 200);
  return el(
    'div',
    { className: 'composer-reply-bar composer-edit-bar', 'data-edit-bar': '' },
    [
      el(Icon, { key: 'i', name: 'edit', size: 18 }),
      el('span', { key: 'b', className: 'link-preview-body' }, [
        el(
          'span',
          { key: 't', className: 'link-preview-site' },
          t('chat.editing')
        ),
        el('span', { key: 'x', className: 'link-preview-text' }, line),
      ]),
      el(
        'button',
        {
          key: 'x',
          type: 'button',
          className: 'composer-reply-clear',
          'data-action': 'edit-cancel',
          'aria-label': t('chat.editCancel'),
          title: t('chat.editCancel'),
          onClick: onCancel,
        },
        el(Icon, { name: 'close', size: 16 })
      ),
    ]
  );
};

/** The caret goes to the end of the box when an edit starts. */
export const useCaretAtEnd = (box, id) => {
  useEffect(() => {
    const area = box.current;
    if (id === null || !area) {
      return;
    }
    area.focus();
    area.setSelectionRange(area.value.length, area.value.length);
  }, [id]);
};

/**
 * The composer's edit mode: `{ editing, start(message), cancel(), save() }`.
 * `box` is the draft box; the typed draft is put away while editing.
 */
export const useEditMode = ({ api, box, key, preview, report }) => {
  const [editing, setEditing] = useState(null);
  const now = useRef(null);
  const stop = () => {
    const was = now.current;
    now.current = null;
    preview.current = null;
    box.quiet.current = false;
    if (was) {
      box.write(was.key, was.stash, { local: false });
    }
    setEditing(null);
  };
  const start = (message) => {
    if (!key || !message) {
      return;
    }
    const was = now.current;
    const stash = was ? was.stash : box.get(key);
    const before = editableText(message);
    box.quiet.current = { key, stash };
    preview.current = null;
    box.write(key, before, { local: false });
    now.current = { message, before, stash, key };
    setEditing(now.current);
  };
  const save = () => {
    const was = now.current;
    if (!was) {
      return false;
    }
    const text = box.get(was.key);
    const outcome = editOutcome({
      message: was.message,
      text,
      before: was.before,
    });
    if (outcome === 'ignore') {
      return true;
    }
    if (outcome === 'save' && typeof api?.messageAction === 'function') {
      const body = editBody({
        message: was.message,
        text,
        preview: preview.current,
      });
      Promise.resolve(api.messageAction('edit', body)).then(report, () => {});
    }
    stop();
    return true;
  };
  // Another chat: the edit ends there, its draft back.
  useEffect(() => () => now.current && stop(), [key]);
  return { editing, start, cancel: stop, save };
};
