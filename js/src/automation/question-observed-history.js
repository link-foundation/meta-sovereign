import { isDeepStrictEqual } from 'node:util';
import { messageTime } from '../crm/message-time.js';
import { messageLinkProperties } from '../message-link-targets.js';
import { toBrowserMessageLink } from '../sources/browser-message.js';

const delivered = ['sent', 'delivered', 'read'];
const unavailable = ['pending', 'sending', 'failed', 'unknown'];

const confirmedMessage = (message, saved) =>
  !saved.deleted &&
  !saved.pending &&
  !saved.failed &&
  !unavailable.includes(saved.status) &&
  !unavailable.includes(message.delivery) &&
  (message.outgoing
    ? delivered.includes(message.delivery)
    : saved.out !== true && saved.sender !== 'me');

/** Read the same browser rows back from durable Chat before learning. */
export const acknowledgedBrowserTurn = async (
  store,
  source,
  chat,
  rows,
  signal,
  vacancyId
) => {
  const transcript = [];
  let previous = -Infinity;
  for (const row of rows) {
    signal.throwIfAborted();
    const message = {
      ...toBrowserMessageLink(source, chat, row),
      service: row.service === true,
      links: messageLinkProperties(row.links).links ?? [],
    };
    if (message.id.length > 500) {
      return null;
    }
    const saved = await store.get(message.id);
    if (
      !saved ||
      (vacancyId && saved.hhBrowserVacancyId !== vacancyId) ||
      Object.entries(message).some(
        ([key, value]) => !isDeepStrictEqual(value, saved[key])
      )
    ) {
      return null;
    }
    const time = messageTime(message.timestamp);
    const confirmed = confirmedMessage(message, saved);
    if (message.service) {
      transcript.push(message);
      previous = -Infinity;
    } else if (time < previous || !confirmed || !Number.isFinite(time)) {
      // An uncertain outgoing fragment must not turn a partial answer into a
      // proposal. A verified incoming bubble still closes the preceding turn.
      transcript.push(
        confirmed && !message.outgoing && !Number.isFinite(time)
          ? { ...message, service: true }
          : null
      );
      previous = -Infinity;
    } else {
      transcript.push(message);
      previous = time;
    }
  }
  return transcript;
};

export const hasDatedBrowserReply = (rows) =>
  rows.some(
    (row) =>
      row?.outgoing &&
      !row.service &&
      delivered.includes(row.delivery) &&
      Number.isFinite(messageTime(row.timestamp))
  );
