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
 *
 * The other optional fields (R-Y39) — `service`, `edited`, `deleted`,
 * `raw`, `outgoing`, `attachments`, `forwardedFrom`, `reactions`,
 * `delivery` — follow the same rule.
 */

// Optional fields, each kept only when the network said something:
// field → whether a value counts.
const given = (value) => Boolean(value);
const known = (value) => value !== null && value !== undefined;
const nonEmpty = (value) => Array.isArray(value) && value.length > 0;
const OPTIONAL = {
  chatType: given,
  chatName: given,
  senderName: given,
  sticker: given,
  service: given,
  edited: given,
  deleted: given,
  raw: known,
  outgoing: known,
  attachments: nonEmpty,
  forwardedFrom: given,
  reactions: nonEmpty,
  delivery: given,
};

const optionalFields = (fields) =>
  Object.fromEntries(
    Object.entries(OPTIONAL)
      .filter(([name, keep]) => keep(fields[name]))
      .map(([name]) => [name, fields[name]])
  );

export const buildMessageLink = ({
  source,
  externalId,
  sender,
  chat,
  body,
  timestamp,
  replyTo = null,
  ...fields
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
  ...optionalFields(fields),
});
