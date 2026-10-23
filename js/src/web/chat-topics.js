// A forum group's topics, as Telegram's apps show them in their tabs
// layout (R-Y122; learned, never copied): a strip over the messages —
// "All" (the whole group, as "View as messages"), then each topic with
// its colour, title, unread count and a lock when closed, the pinned
// first. Choosing one shows that topic alone: its own window of messages
// (read by page from the store and Telegram by the topic's key), read on
// its own, and what is sent goes to it.

import React, { useEffect, useState } from 'react';
import { useT } from './i18n.js';
import { Icon } from './icons.js';
import { topicRights, useTopicAdmin } from './chat-topic-admin.js';
import { GENERAL_TOPIC, topicKey, topicOfMessage } from './forum-topics.js';

const el = React.createElement;

// The topics are asked again this often while the group is open.
export const TOPICS_REFRESH_MS = 30_000;

/** The chat as its window sees it: the topic's own key while one is open. */
export const viewedChat = (current, topic) =>
  current && topic
    ? { ...current, key: topicKey(current.key, topic), topic }
    : current;

/** The messages of one topic (all of them with none). */
export const topicMessages = (messages, topic) =>
  topic ? messages.filter((m) => topicOfMessage(m) === topic) : messages;

/** A topic's colour (Telegram's RGB number) as CSS; null without one. */
export const topicColor = (value) => {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= 0xffffff
    ? `#${n.toString(16).padStart(6, '0')}`
    : null;
};

const isForum = (api, current) =>
  Boolean(current?.forum) &&
  current?.source === 'telegram' &&
  typeof api.telegramForumTopics === 'function';

// Each forum's topics, by chat key, asked when it opens and again
// every TOPICS_REFRESH_MS (and on `tick`) while it stays open.
const useTopicLists = (api, current, forum, tick, fresh) => {
  const [lists, setLists] = useState(() => new Map());
  const key = current?.key ?? null;
  useEffect(() => {
    if (!forum) {
      return undefined;
    }
    let live = true;
    const chat = String(current.chat);
    const load = () =>
      api
        .telegramForumTopics({ chat, ...(fresh ? { fresh: true } : {}) })
        .then((answer) => {
          if (live && answer?.ok) {
            const topics = answer.forum ? (answer.topics ?? []) : [];
            setLists((before) => new Map(before).set(key, topics));
          }
        })
        .catch(() => {});
    load();
    const timer = globalThis.setInterval(load, TOPICS_REFRESH_MS);
    return () => {
      live = false;
      globalThis.clearInterval(timer);
    };
  }, [api, key, forum, tick, fresh]);
  return forum ? (lists.get(key) ?? null) : null;
};

/**
 * The open forum's topics and the one chosen: `{ forum, topics, topic,
 * open, choose }` — `topic` the id shown (null: all), `open` its entry.
 */
export const useForumTopics = (api, current, tick = 0) => {
  const forum = isForum(api, current);
  const key = current?.key ?? null;
  // A change reads the topics again, past what the server kept.
  const [changes, setChanges] = useState(0);
  const listed = useTopicLists(api, current, forum, tick, changes);
  const [chosen, setChosen] = useState(() => new Map());
  const picked = forum ? (chosen.get(key) ?? null) : null;
  // A topic that is gone (deleted, the list not yet come) shows all.
  const open = picked ? (listed?.find((t) => t.id === picked) ?? null) : null;
  const topic = open || (picked && !listed) ? picked : null;
  return {
    forum,
    // Hidden ones too: the strip shows them to those who manage topics.
    topics: listed ?? [],
    // Whether the list has come (an empty one is not the same as none yet).
    loaded: listed !== null,
    refresh: () => setChanges((n) => n + 1),
    topic,
    open,
    choose: (id) =>
      key && setChosen((before) => new Map(before).set(key, id ?? null)),
  };
};

// A topic's round mark: its colour and first letter; General's a "#".
const TopicIcon = ({ topic }) => {
  const general = topic.id === GENERAL_TOPIC;
  const color = general ? null : topicColor(topic.iconColor);
  return el(
    'span',
    {
      className: general ? 'chat-topic-icon is-general' : 'chat-topic-icon',
      style: color ? { background: color } : undefined,
      'aria-hidden': 'true',
    },
    general ? '#' : Array.from(topic.title.trim())[0]?.toUpperCase() || '#'
  );
};

const Tab = ({ selected, onClick, onMenu, onDrag, id, children }) =>
  el(
    'button',
    {
      type: 'button',
      role: 'tab',
      className: selected ? 'chat-topic is-selected' : 'chat-topic',
      'aria-selected': selected ? 'true' : 'false',
      'data-topic': id,
      // A pinned topic's tab can be dragged sideways (R-Y211).
      ...(onDrag ? { 'data-pinned-topic': '', onPointerDown: onDrag } : {}),
      onClick,
      onContextMenu: onMenu,
    },
    children
  );

const TopicTab = ({ topic, selected, onChoose, onMenu, onDrag, t }) =>
  el(
    Tab,
    {
      selected,
      id: String(topic.id),
      onDrag: topic.pinned && topic.id !== GENERAL_TOPIC ? onDrag : null,
      onClick: () => onChoose(topic.id),
      onMenu: (event) => {
        event.preventDefault();
        onMenu(topic, { x: event.clientX, y: event.clientY });
      },
    },
    [
      el(TopicIcon, { key: 'i', topic }),
      el('span', { key: 't', className: 'chat-topic-title' }, topic.title),
      topic.closed
        ? el(
            'span',
            {
              key: 'c',
              className: 'chat-topic-closed',
              title: t('chat.topics.closed'),
            },
            el(Icon, { name: 'lock', size: 12 })
          )
        : null,
      topic.unread > 0
        ? el(
            'span',
            {
              key: 'u',
              className:
                topic.mentions > 0
                  ? 'chat-topic-unread is-mention'
                  : 'chat-topic-unread',
            },
            topic.mentions > 0 ? '@' : String(topic.unread)
          )
        : null,
    ]
  );

/**
 * The topics the strip shows: a hidden one (General) only to those who
 * manage topics, or while it is the one open.
 */
export const shownTopics = (topics, open, info) =>
  topics.filter((t) => !t.hidden || t.id === open || topicRights(info).manage);

/**
 * The strip of topics over a forum's messages; nothing elsewhere. With
 * `api`, `chat` and `info` it also manages them (R-Y153): a "+" for a
 * new topic and a menu on a right-click.
 */
export const TopicTabs = ({ forum, api, chat, info }) => {
  const t = useT();
  const admin = useTopicAdmin({ api, chat, forum, info });
  const topics = shownTopics(forum?.topics ?? [], forum?.topic, info);
  if (!forum?.forum || (topics.length === 0 && !admin.canCreate)) {
    return null;
  }
  return el(React.Fragment, null, [
    el(
      'nav',
      {
        key: 'nav',
        className: 'chat-topics',
        role: 'tablist',
        'aria-label': t('chat.topics.label'),
      },
      [
        el(
          Tab,
          {
            key: 'all',
            id: 'all',
            selected: !forum.topic,
            onClick: () => forum.choose(null),
          },
          el('span', { className: 'chat-topic-title' }, t('chat.topics.all'))
        ),
        ...topics.map((topic) =>
          el(TopicTab, {
            key: topic.id,
            topic,
            selected: forum.topic === topic.id,
            onChoose: forum.choose,
            onMenu: admin.onMenu,
            onDrag: admin.dragStart,
            t,
          })
        ),
        admin.canCreate
          ? el(
              'button',
              {
                key: 'new',
                type: 'button',
                className: 'chat-topic chat-topic-new',
                'data-action': 'topic-new',
                'aria-label': t('chat.topics.new'),
                title: t('chat.topics.new'),
                onClick: admin.create,
              },
              '+'
            )
          : null,
      ]
    ),
    admin.failed
      ? el(
          'p',
          { key: 'err', className: 'topic-admin-error', role: 'alert' },
          admin.failed
        )
      : null,
    ...admin.nodes,
  ]);
};
