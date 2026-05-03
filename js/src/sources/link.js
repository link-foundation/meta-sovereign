/**
 * Shared normalized Link builders for source adapters.
 */

export const buildMessageLink = ({
  source,
  externalId,
  sender,
  chat,
  body,
  timestamp,
  replyTo = null,
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
});
