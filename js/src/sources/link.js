/**
 * Shared normalized Link builders for source adapters.
 *
 * `chatType`, `chatName` and `senderName` are optional: adapters that
 * know them (Telegram exports carry `personal_chat`/`private_group`…)
 * pass them on, and links from adapters that do not stay unchanged.
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
  chatType = null,
  chatName = null,
  senderName = null,
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
  ...(chatType ? { chatType } : {}),
  ...(chatName ? { chatName } : {}),
  ...(senderName ? { senderName } : {}),
  ...(sticker ? { sticker } : {}),
});
