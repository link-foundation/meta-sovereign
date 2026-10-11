/**
 * Shared normalized Link builders for source adapters.
 *
 * `chatType`, `chatName` and `senderName` are optional: adapters that
 * know them (Telegram exports carry `personal_chat`/`private_group`…)
 * pass them on, and links from adapters that do not stay unchanged.
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
});
