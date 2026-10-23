// A forum group's topics, as Telegram's apps show them in their tabs
// layout (R-Y122; learned, never copied): a strip over the messages —
// "All" (the whole group, as "View as messages"), then each topic with
// its colour, title, unread count and a lock when closed, the pinned
// first. Choosing one shows that topic alone: its own window of messages
// (read by page from the store and Telegram by the topic's key), read on
// its own, and what is sent goes to it.

import React, { useEffect, useMemo, useState } from 'react';
import { useT } from './i18n.js';
import { Icon } from './icons.js';
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
const useTopicLists = (api, current, forum, tick) => {
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
        .telegramForumTopics({ chat })
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
  }, [api, key, forum, tick]);
  return forum ? (lists.get(key) ?? null) : null;
};

/**
 * The open forum's topics and the one chosen: `{ forum, topics, topic,
 * open, choose }` — `topic` the id shown (null: all), `open` its entry.
 */
export const useForumTopics = (api, current, tick = 0) => {
  const forum = isForum(api, current);
  const key = current?.key ?? null;
  const listed = useTopicLists(api, current, forum, tick);
  const [chosen, setChosen] = useState(() => new Map());
  const picked = forum ? (chosen.get(key) ?? null) : null;
  // A topic that is gone (deleted, the list not yet come) shows all.
  const open = picked ? (listed?.find((t) => t.id === picked) ?? null) : null;
  const topic = open || (picked && !listed) ? picked : null;
  const topics = useMemo(
    () => (listed ?? []).filter((t) => !t.hidden || t.id === topic),
    [listed, topic]
  );
  return {
    forum,
    topics,
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

const Tab = ({ selected, onClick, id, children }) =>
  el(
    'button',
    {
      type: 'button',
      role: 'tab',
      className: selected ? 'chat-topic is-selected' : 'chat-topic',
      'aria-selected': selected ? 'true' : 'false',
      'data-topic': id,
      onClick,
    },
    children
  );

const TopicTab = ({ topic, selected, onChoose, t }) =>
  el(
    Tab,
    { selected, id: String(topic.id), onClick: () => onChoose(topic.id) },
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

/** The strip of topics over a forum's messages; nothing elsewhere. */
export const TopicTabs = ({ forum }) => {
  const t = useT();
  if (!forum?.forum || forum.topics.length === 0) {
    return null;
  }
  return el(
    'nav',
    {
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
      ...forum.topics.map((topic) =>
        el(TopicTab, {
          key: topic.id,
          topic,
          selected: forum.topic === topic.id,
          onChoose: forum.choose,
          t,
        })
      ),
    ]
  );
};
