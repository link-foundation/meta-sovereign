// A channel post's comments and a group message's thread (R-Y126), as
// Telegram's apps open them (learned, never copied): the post on top,
// "Discussion started" under it, then the comments oldest first, with
// their senders' names and avatars; older ones load on demand. A
// composer at the foot sends a comment to the discussion group, as an
// answer to the post or, after Reply on a comment, to that comment.
// Escape, the close button or a click beside the panel closes it.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useT } from './i18n.js';
import { Icon } from './icons.js';
import { MessageBubble } from './chat-message.js';
import { byTime, networkMessageId } from './chat-model.js';
import { useEsc } from './chat-invite.js';
import { threadOf } from './chat-comments-bar.js';
import { menuItems } from './chat-selection.js';
import { messageAuthor } from './message-visibility.js';
import { hideMessageSender } from './message-visibility-prefs.js';

const el = React.createElement;

const merged = (old, fresh) => {
  const byId = new Map(old.map((m) => [m.id, m]));
  for (const message of fresh) {
    byId.set(message.id, message);
  }
  return [...byId.values()].sort(byTime);
};

// The thread, loaded by page: `load()` the newest, `load(before)` older.
const useThread = (api, chat, post) => {
  const [state, setState] = useState({ phase: 'loading', messages: [] });
  const load = useCallback(
    async (before = null) => {
      const answer = await api
        .telegramComments({ chat, post, ...(before ? { before } : {}) })
        .catch(() => null);
      setState((prev) => {
        if (!answer?.ok) {
          return prev.phase === 'ready'
            ? prev
            : { phase: 'error', code: answer?.code, messages: [] };
        }
        const first = prev.phase !== 'ready';
        return {
          phase: 'ready',
          group: answer.group,
          messages: merged(prev.messages, answer.messages ?? []),
          // Older ones are left while the oldest page is not reached.
          complete: before || first ? Boolean(answer.complete) : prev.complete,
        };
      });
    },
    [api, chat, post]
  );
  useEffect(() => {
    load();
  }, [load]);
  return [state, load];
};

// The comments shown are read, once for each newest one seen.
const useReadMark = (api, chat, post, messages) => {
  const sent = useRef(0);
  const max = messages.reduce(
    (top, m) => Math.max(top, networkMessageId(m) ?? 0),
    0
  );
  useEffect(() => {
    if (max > sent.current && typeof api.telegramCommentsRead === 'function') {
      sent.current = max;
      api.telegramCommentsRead({ chat, post, max }).catch(() => {});
    }
  }, [api, chat, post, max]);
};

const nameOf = (message) => message.senderName || message.chatName || '';

const ReplyBar = ({ replyTo, onCancel, t }) =>
  el('div', { className: 'comments-reply' }, [
    el(Icon, { key: 'i', name: 'reply' }),
    el('span', { key: 'w', className: 'comments-reply-text' }, [
      el('strong', { key: 'n' }, nameOf(replyTo)),
      ` ${replyTo.body ?? ''}`,
    ]),
    el(
      'button',
      {
        key: 'x',
        type: 'button',
        className: 'icon-btn',
        'data-action': 'reply-cancel',
        'aria-label': t('chat.comments.replyCancel'),
        onClick: onCancel,
      },
      el(Icon, { name: 'close' })
    ),
  ]);

// The composer: Enter sends, Shift+Enter breaks the line.
const useCommentSender = ({ api, chat, post, load, onSent, visibility }) => {
  const [text, setText] = useState('');
  const [target, setReplyTo] = useState(null);
  const hidden = visibility?.hides(target);
  const replyTo = hidden ? null : target;
  useEffect(() => {
    if (hidden) {
      setReplyTo(null);
    }
  }, [hidden]);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const send = async () => {
    const body = text.trim();
    if (!body || busy) {
      return;
    }
    setBusy(true);
    setFailed(false);
    const answer = await api
      .telegramCommentSend({
        chat,
        post,
        text: body,
        ...(replyTo ? { replyTo: networkMessageId(replyTo) } : {}),
      })
      .catch(() => null);
    setBusy(false);
    if (!answer?.ok) {
      setFailed(true);
      return;
    }
    setText('');
    setReplyTo(null);
    await load();
    onSent();
  };
  return { text, setText, replyTo, setReplyTo, busy, failed, send };
};

const Composer = ({ sender, t, comments, inputRef }) =>
  el('div', { className: 'comments-composer' }, [
    sender.replyTo
      ? el(ReplyBar, {
          key: 'r',
          replyTo: sender.replyTo,
          onCancel: () => sender.setReplyTo(null),
          t,
        })
      : null,
    sender.failed
      ? el(
          'p',
          { key: 'f', className: 'comments-failed', role: 'alert' },
          t('chat.comments.sendFailed')
        )
      : null,
    el('div', { key: 'row', className: 'comments-composer-row' }, [
      el('textarea', {
        key: 't',
        ref: inputRef,
        rows: 1,
        value: sender.text,
        placeholder: t(
          comments ? 'chat.comments.write' : 'chat.comments.reply'
        ),
        'aria-label': t(
          comments ? 'chat.comments.write' : 'chat.comments.reply'
        ),
        onChange: (e) => sender.setText(e.target.value),
        onKeyDown: (e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
            e.preventDefault();
            sender.send();
          }
        },
      }),
      el(
        'button',
        {
          key: 's',
          type: 'button',
          className: 'icon-btn comments-send',
          'data-action': 'comment-send',
          'aria-label': t('common.send'),
          disabled: sender.busy || !sender.text.trim(),
          onClick: sender.send,
        },
        el(Icon, { name: 'send' })
      ),
    ]),
  ]);

const listStatus = (state, list, t) => {
  if (state.phase === 'loading') {
    return el(
      'p',
      { key: 'st', className: 'meta' },
      t('chat.comments.loading')
    );
  }
  if (state.phase === 'error') {
    return el(
      'p',
      { key: 'st', className: 'comments-failed', role: 'alert' },
      t(
        state.code === 'no-comments'
          ? 'chat.comments.none'
          : 'chat.comments.failed'
      )
    );
  }
  return list.length === 0
    ? el(
        'p',
        { key: 'st', className: 'meta' },
        t(
          state.messages.length
            ? 'chat.visibility.empty'
            : 'chat.comments.empty'
        )
      )
    : null;
};

// The comments as the chat draws a group: names on the first of a run,
// avatars on its last.
const CommentList = ({
  state,
  list,
  api,
  onAction,
  onOlder,
  t,
  visibility,
}) => {
  const known = new Map(state.messages.map((m) => [m.id, m]));
  const msgById = visibility?.lookup(known) ?? known;
  return [
    state.phase === 'ready' && !state.complete && state.messages.length > 0
      ? el(
          'button',
          {
            key: 'older',
            type: 'button',
            className: 'comments-older',
            'data-action': 'comments-older',
            onClick: onOlder,
          },
          t('chat.comments.older')
        )
      : null,
    listStatus(state, list, t),
    ...list.map((message, i) =>
      el(MessageBubble, {
        key: message.id,
        message,
        showName: list[i - 1]?.sender !== message.sender,
        showAvatar: list[i + 1]?.sender !== message.sender,
        msgById,
        api,
        onAction,
        menuFor: (message, options) =>
          menuItems({
            message,
            ...options,
            hideSender: Boolean(messageAuthor(message)),
          }),
        fastReply: true,
      })
    ),
  ];
};

const CommentsPanel = ({ post, api, close, visibility, notify }) => {
  const t = useT();
  const chat = String(post.chat ?? '');
  const id = networkMessageId(post);
  const comments = threadOf(post)?.comments ?? true;
  const [state, load] = useThread(api, chat, id);
  const list = visibility?.show(state.messages) ?? state.messages;
  useReadMark(api, chat, id, list);
  const end = useRef(null);
  const input = useRef(null);
  const toEnd = () => end.current?.scrollIntoView?.({ block: 'end' });
  const sender = useCommentSender({
    api,
    chat,
    post: id,
    load,
    onSent: toEnd,
    visibility,
  });
  useEsc(close);
  const ready = state.phase === 'ready';
  useEffect(() => {
    if (ready) {
      toEnd();
    }
  }, [ready]);
  const onAction = (action, message) => {
    if (action === 'reply') {
      sender.setReplyTo(message);
      input.current?.focus();
    }
    if (action === 'hideSender') {
      hideMessageSender(message, notify);
    }
  };
  const older = () => load(networkMessageId(state.messages[0]));
  return el(
    'div',
    {
      className: 'delete-dialog-overlay comments-overlay',
      onMouseDown: (e) => {
        if (e.target === e.currentTarget) {
          close();
        }
      },
    },
    el(
      'div',
      {
        className: 'comments-panel',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': t(
          comments ? 'chat.comments.title' : 'chat.comments.thread'
        ),
        'data-dialog': 'comments',
      },
      [
        el('header', { key: 'h', className: 'comments-head' }, [
          el('div', { key: 'w', className: 'comments-head-text' }, [
            el(
              'strong',
              { key: 't' },
              t(comments ? 'chat.comments.title' : 'chat.comments.thread')
            ),
            state.group?.title
              ? el('span', { key: 'g', className: 'meta' }, state.group.title)
              : null,
          ]),
          el(
            'button',
            {
              key: 'x',
              type: 'button',
              className: 'icon-btn',
              'data-action': 'close',
              'aria-label': t('chat.comments.close'),
              onClick: close,
            },
            el(Icon, { name: 'close' })
          ),
        ]),
        el('div', { key: 's', className: 'comments-scroll' }, [
          el('div', { key: 'c', className: 'chat-column comments-column' }, [
            el(MessageBubble, {
              key: 'post',
              message: post,
              isPersonal: true,
              api,
            }),
            el(
              'div',
              { key: 'start', className: 'comments-start' },
              t('chat.comments.start')
            ),
            ...CommentList({
              state,
              list,
              api,
              onAction,
              onOlder: older,
              t,
              visibility,
            }),
            el('div', { key: 'end', ref: end }),
          ]),
        ]),
        el(Composer, { key: 'cmp', sender, t, comments, inputRef: input }),
      ]
    )
  );
};

/**
 * The comments panel of the open chat: `{ open(message), dialog }`;
 * `dialog` is null while it is closed.
 */
export const useComments = ({ api, visibility, notify }) => {
  const [post, setPost] = useState(null);
  const close = useCallback(() => setPost(null), []);
  const hidden = visibility?.hides(post);
  useEffect(() => {
    if (hidden) {
      close();
    }
  }, [hidden, close]);
  return {
    open: (message) => setPost(message),
    dialog:
      post && !hidden
        ? el(CommentsPanel, {
            key: 'comments',
            post,
            api,
            close,
            visibility,
            notify,
          })
        : null,
  };
};
