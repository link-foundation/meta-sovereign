// Managing a forum's topics, as Telegram Desktop does (R-Y153; learned,
// never copied): a "+" at the end of the topic strip makes a topic (a
// name, one of Telegram's six colours, an emoji from the topic icons);
// a right-click on a topic offers Edit, Close or Reopen, Pin or Unpin and
// Delete (after a question), General's offers Close and Hide; only what
// the user's rights allow. A closed topic's composer is replaced by "The
// topic is closed" for those who cannot manage topics. A supergroup's
// creator can switch Topics on and off in the info column.

import React, { useEffect, useState } from 'react';
import { useT } from './i18n.js';
import { FormDialog, Title } from './chat-create.js';
import { MsgContextMenu } from './chat-message.js';
import { GENERAL_TOPIC, TOPIC_COLORS } from './forum-topics.js';
import { beginPinGesture } from './chat-pin-drag.js';

const el = React.createElement;

const NONE = { manage: false, create: false, delete: false };

/** What the user may do with the open forum's topics (from its info). */
export const topicRights = (info) => ({ ...NONE, ...(info?.topics ?? {}) });

/** Whether the open topic is closed to this user: no composer. */
export const topicClosedFor = (open, info) =>
  Boolean(open?.closed) && !topicRights(info).manage;

/** The menu's items for a topic, in Desktop's order, by the user's rights. */
export const topicMenuItems = (topic, info) => {
  const rights = topicRights(info);
  const items = [];
  if (topic.id === GENERAL_TOPIC) {
    if (rights.manage) {
      items.push(topic.closed ? 'reopenTopic' : 'closeTopic');
      items.push(topic.hidden ? 'showTopic' : 'hideTopic');
    }
    return items;
  }
  if (rights.manage) {
    items.push(topic.pinned ? 'unpinTopic' : 'pinTopic');
  }
  if (rights.manage || topic.mine) {
    items.push('editTopic', topic.closed ? 'reopenTopic' : 'closeTopic');
  }
  if (rights.delete || rights.manage) {
    items.push('deleteTopic');
  }
  return items;
};

// What each item asks: [page API method, fields].
const ASK = {
  closeTopic: ['telegramTopicEdit', { closed: true }],
  reopenTopic: ['telegramTopicEdit', { closed: false }],
  hideTopic: ['telegramTopicEdit', { hidden: true }],
  showTopic: ['telegramTopicEdit', { hidden: false }],
  pinTopic: ['telegramTopicPin', { pinned: true }],
  unpinTopic: ['telegramTopicPin', { pinned: false }],
};

/** The request an item makes: `{ method, body }`, or null (a dialog's). */
export const topicRequest = (key, chat, topic) =>
  ASK[key]
    ? {
        method: ASK[key][0],
        body: { chat: String(chat), topic: topic.id, ...ASK[key][1] },
      }
    : null;

/** A topic's edit: only the fields that changed (icon '0' takes it off). */
export const editBody = (chat, topic, { title, icon }) => {
  const body = { chat: String(chat), topic: topic.id };
  if (title.trim() !== topic.title) {
    body.title = title.trim();
  }
  if (icon !== (topic.iconEmojiId ?? '0')) {
    body.iconEmojiId = icon;
  }
  return Object.keys(body).length > 2 ? body : null;
};

/** The ids of the pinned topics (never General), in the strip's order. */
export const pinnedTopicIds = (topics = []) =>
  topics.filter((t) => t.pinned && t.id !== GENERAL_TOPIC).map((t) => t.id);

/**
 * The pinned topics' ids after the one at place `from` is dragged to place
 * `to` (R-Y211); null when it did not move.
 */
export const reorderedPins = (topics, from, to) => {
  const ids = pinnedTopicIds(topics);
  if (from === to || !ids[from] || to < 0 || to >= ids.length) {
    return null;
  }
  const [lifted] = ids.splice(from, 1);
  ids.splice(to, 0, lifted);
  return ids;
};

const TOPIC_DRAG = {
  list: '.chat-topics',
  rows: '.chat-topic[data-pinned-topic]',
  axis: 'x',
};

/**
 * A press on a pinned topic tab may become a drag sideways, for those who
 * manage topics (R-Y211): dropped, the pinned topics are put in the new
 * order (`api.telegramTopicReorder`) and the topics read again.
 */
export const topicDragStart =
  ({ api, chat, topics, manage, refresh }) =>
  (event) => {
    if (
      !manage ||
      typeof api?.telegramTopicReorder !== 'function' ||
      (event.pointerType === 'mouse' && event.button !== 0)
    ) {
      return;
    }
    beginPinGesture(
      event,
      event.currentTarget,
      (from, to) => {
        const order = reorderedPins(topics, from, to);
        if (order) {
          Promise.resolve(
            api.telegramTopicReorder({ chat: String(chat), order })
          ).then(refresh, refresh);
        }
      },
      TOPIC_DRAG
    );
  };

const errorText = (t, code) => {
  const key = `chat.topics.err.${code}`;
  const text = t(key);
  return text === key ? t('chat.topics.err.failed') : text;
};

const cssColor = (n) => `#${n.toString(16).padStart(6, '0')}`;

const Colors = ({ value, set, t }) =>
  el(
    'div',
    {
      className: 'topic-colors',
      role: 'radiogroup',
      'aria-label': t('chat.topics.color'),
    },
    TOPIC_COLORS.map((color) =>
      el('button', {
        key: color,
        type: 'button',
        role: 'radio',
        'aria-checked': value === color ? 'true' : 'false',
        'aria-label': cssColor(color),
        'data-color': color,
        className: value === color ? 'topic-color is-selected' : 'topic-color',
        style: { background: cssColor(color) },
        onClick: () => set(color),
      })
    )
  );

// The emoji a topic may carry, asked once while the dialog is open.
const useIcons = (api) => {
  const [icons, setIcons] = useState([]);
  useEffect(() => {
    let live = true;
    Promise.resolve(api?.telegramTopicIcons?.())
      .then((answer) => live && answer?.ok && setIcons(answer.icons ?? []))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [api]);
  return icons;
};

const Icons = ({ api, value, set, t }) => {
  const icons = useIcons(api);
  if (icons.length === 0) {
    return null;
  }
  const pick = (id, label, text) =>
    el(
      'button',
      {
        key: id,
        type: 'button',
        'aria-pressed': value === id ? 'true' : 'false',
        'aria-label': label,
        'data-icon-emoji': id,
        className:
          value === id ? 'topic-icon-pick is-selected' : 'topic-icon-pick',
        onClick: () => set(id),
      },
      text
    );
  return el('div', { className: 'topic-icons', role: 'group' }, [
    pick('0', t('chat.topics.noIcon'), '∅'),
    ...icons.map((icon) => pick(icon.id, icon.emoji, icon.emoji)),
  ]);
};

// The dialog of a new topic (`topic` null) or an edited one.
const TopicDialog = ({ api, chat, topic, close, done }) => {
  const t = useT();
  const [title, setTitle] = useState(topic?.title ?? '');
  const [color, setColor] = useState(TOPIC_COLORS[0]);
  const [icon, setIcon] = useState(topic?.iconEmojiId ?? '0');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const submit = async () => {
    const body = topic
      ? editBody(chat, topic, { title, icon })
      : {
          chat: String(chat),
          title: title.trim(),
          iconColor: color,
          ...(icon === '0' ? {} : { iconEmojiId: icon }),
        };
    if (!body) {
      close();
      return;
    }
    setBusy(true);
    const answer = await (
      topic ? api.telegramTopicEdit(body) : api.telegramTopicCreate(body)
    ).catch(() => null);
    setBusy(false);
    if (answer?.ok) {
      done();
    } else {
      setError(errorText(t, answer?.code ?? 'failed'));
    }
  };
  return el(
    FormDialog,
    {
      name: topic ? 'topic-edit' : 'topic-create',
      title: t(topic ? 'chat.topics.editTitle' : 'chat.topics.newTitle'),
      submit: t(topic ? 'chat.topics.save' : 'chat.topics.create'),
      onClose: close,
      onSubmit: () => title.trim() && submit(),
      busy: busy || !title.trim(),
      error,
    },
    [
      el(Title, {
        key: 'title',
        label: t('chat.topics.name'),
        value: title,
        set: setTitle,
      }),
      topic ? null : el(Colors, { key: 'c', value: color, set: setColor, t }),
      el(Icons, { key: 'i', api, value: icon, set: setIcon, t }),
    ]
  );
};

const DeleteTopicDialog = ({ api, chat, topic, close, done }) => {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const submit = async () => {
    setBusy(true);
    const answer = await api
      .telegramTopicDelete({ chat: String(chat), topic: topic.id })
      .catch(() => null);
    setBusy(false);
    if (answer?.ok) {
      done();
    } else {
      setError(errorText(t, answer?.code ?? 'failed'));
    }
  };
  return el(
    FormDialog,
    {
      name: 'topic-delete',
      title: t('chat.topics.deleteTitle'),
      submit: t('chat.topics.delete'),
      onClose: close,
      onSubmit: submit,
      busy,
      error,
    },
    el('p', { key: 'q' }, t('chat.topics.deleteBody', { title: topic.title }))
  );
};

/**
 * The topic admin for the strip: `{ onMenu(topic, point), canCreate,
 * create(), nodes }` — `nodes` the open menu and dialog. Every change asks
 * the forum to read its topics again.
 */
export const useTopicAdmin = ({ api, chat, forum, info }) => {
  const [menu, setMenu] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [failed, setFailed] = useState(null);
  const t = useT();
  const id = chat?.chat;
  const close = () => setDialog(null);
  const done = () => {
    close();
    forum?.refresh?.();
  };
  const run = async (request) => {
    const answer = await api[request.method](request.body).catch(() => null);
    setFailed(answer?.ok ? null : errorText(t, answer?.code ?? 'failed'));
    if (answer?.ok) {
      forum?.refresh?.();
    }
  };
  const onAction = (key, topic) => {
    const request = topicRequest(key, id, topic);
    if (request) {
      run(request);
    } else if (key === 'editTopic') {
      setDialog({ kind: 'edit', topic });
    } else if (key === 'deleteTopic') {
      setDialog({ kind: 'delete', topic });
    }
  };
  const shared = { api, chat: id, close, done };
  let shown = null;
  if (dialog?.kind === 'delete') {
    shown = el(DeleteTopicDialog, { ...shared, topic: dialog.topic });
  } else if (dialog) {
    shown = el(TopicDialog, { ...shared, topic: dialog.topic ?? null });
  }
  return {
    canCreate: topicRights(info).create && Boolean(api?.telegramTopicCreate),
    // Pinned tabs may be dragged to reorder them (R-Y211).
    dragStart: topicDragStart({
      api,
      chat: id,
      topics: forum?.topics ?? [],
      manage: topicRights(info).manage,
      refresh: () => forum?.refresh?.(),
    }),
    create: () => setDialog({ kind: 'create' }),
    failed,
    onMenu: (topic, point) => {
      const items = topicMenuItems(topic, info);
      if (items.length > 0) {
        setMenu({ topic, point, items });
      }
    },
    nodes: [
      menu
        ? el(MsgContextMenu, {
            key: `menu:${menu.topic.id}`,
            x: menu.point.x,
            y: menu.point.y,
            message: menu.topic,
            items: menu.items,
            reactions: false,
            onClose: () => setMenu(null),
            onAction,
          })
        : null,
      shown ? el(React.Fragment, { key: 'dialog' }, shown) : null,
    ],
  };
};

/** What replaces the composer in a topic that is closed to the user. */
export const TopicClosedBar = () => {
  const t = useT();
  return el(
    'div',
    { className: 'topic-closed-bar', role: 'status', 'data-topic-closed': '' },
    t('chat.topics.closedBar')
  );
};

/** A supergroup creator's switch for Topics, in the info column. */
export const ForumToggle = ({ api, chat, info }) => {
  const t = useT();
  const [on, setOn] = useState(Boolean(info?.forum));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => setOn(Boolean(info?.forum)), [info?.forum]);
  const change = async (enabled) => {
    setBusy(true);
    const answer = await api
      .telegramForumToggle({ chat: String(chat.chat), enabled })
      .catch(() => null);
    setBusy(false);
    if (answer?.ok) {
      setOn(enabled);
      setError(null);
    } else {
      setError(errorText(t, answer?.code ?? 'failed'));
    }
  };
  return el('div', { className: 'forum-toggle' }, [
    el('label', { key: 'l', className: 'admin-toggle' }, [
      el('input', {
        key: 'i',
        type: 'checkbox',
        'data-action': 'toggle-forum',
        checked: on,
        disabled: busy,
        onChange: (e) => change(e.target.checked),
      }),
      el('span', { key: 's' }, t('chat.topics.forum')),
    ]),
    el('p', { key: 'h', className: 'meta' }, t('chat.topics.forumHint')),
    error
      ? el(
          'p',
          { key: 'e', className: 'comments-failed', role: 'alert' },
          error
        )
      : null,
  ]);
};
