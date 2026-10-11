/**
 * Shared normalized Link builders for source adapters.
 *
 * `sticker` (issue #35) is only set when the message is a sticker, so
 * text messages keep their historical shape: `{id, pack}` with the
 * network's own sticker id and optional pack/set name, plus `emoji`
 * where the network reports one (Telegram).
 */

export const buildMessageLink = ({
  source,
  externalId,
  sender,
  chat,
  body,
  timestamp,
  replyTo = null,
  sticker = null,
}) => ({
  id: `msg:${source}:${externalId}`,
  tokens: ['message', source, externalId],
  children: [
    `sender:${source}:${sender}`,
    `chat:${source}:${chat}`,
    `body:${source}:${externalId}`,
    `ts:${source}:${externalId}`,
    ...(replyTo ? [`replyto:${source}:${replyTo}`] : []),
  ],
  source,
  body,
  timestamp,
  sender,
  chat,
  replyTo,
  ...(sticker ? { sticker } : {}),
});
