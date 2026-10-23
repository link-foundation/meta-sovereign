/**
 * A forum group's topics, as Telegram's apps tell them apart (R-Y122;
 * learned, never copied): a message belongs to the topic its reply
 * header names (`forum_topic`, the topic's first message as
 * `reply_to_top_id`, or `reply_to_msg_id` when it answers that one); the
 * message that opened a topic is that topic's own; anything else is in
 * General, topic 1. Shared by the server's chat index and the page.
 */

export const GENERAL_TOPIC = 1;

// Telegram's six topic colours (R-Y153).
export const TOPIC_COLORS = Object.freeze([
  0x6fb9f0, 0xffd67e, 0xcb86db, 0x8eee98, 0xff93b2, 0xfb6f5f,
]);

const positive = (value) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
};

/** The topic a message is in (General when nothing says otherwise). */
export const topicOfMessage = (message) => {
  const own = positive(message?.topic);
  if (own) {
    return own;
  }
  const raw = message?.raw;
  if (raw?.action?.className === 'MessageActionTopicCreate') {
    return positive(raw.id) ?? GENERAL_TOPIC;
  }
  const reply = raw?.replyTo;
  if (reply?.forumTopic) {
    return (
      positive(reply.replyToTopId) ??
      positive(reply.replyToMsgId) ??
      GENERAL_TOPIC
    );
  }
  return GENERAL_TOPIC;
};

/**
 * Whether a reply header only says its message is in a topic (it names
 * the topic's first message, nothing more), not that it answers one.
 */
export const inTopicOnly = (reply) =>
  Boolean(reply?.forumTopic) &&
  (!reply.replyToTopId || reply.replyToTopId === reply.replyToMsgId);

const TOPIC_KEY = /^(.*)#topic:(\d{1,10})$/;

/** The key a topic's window and page are asked by. */
export const topicKey = (key, topic) => `${key}#topic:${topic}`;

/** `{ key, topic }` of a key; `topic` null for a whole chat's. */
export const splitTopicKey = (key) => {
  const match = TOPIC_KEY.exec(String(key ?? ''));
  return match
    ? { key: match[1], topic: Number(match[2]) }
    : { key: String(key ?? ''), topic: null };
};

/**
 * What a send from the composer answers: its reply, else the topic it is
 * in (R-Y122); null for neither.
 */
export const composerReplyId = (composer) =>
  topicReplyId(composer?.topic ?? null, composer?.replyTo?.msgId ?? null);

/**
 * What a send in `topic` answers: the message replied to, else the
 * topic's first message (General needs none).
 */
export const topicReplyId = (topic, replyTo = null) => {
  const id = positive(replyTo);
  if (id) {
    return id;
  }
  const at = positive(topic);
  return at && at !== GENERAL_TOPIC ? at : null;
};
