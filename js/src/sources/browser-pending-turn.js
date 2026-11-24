import { messageLinkProperties } from '../message-link-targets.js';

/** The complete bounded incoming suffix of rendered history, never provider coverage. */
export const browserPendingTurn = (rows) => {
  const validText = (value, limit, empty = false) =>
    typeof value === 'string' &&
    value.length <= limit &&
    (empty || Boolean(value.trim()));
  const end = rows.findLastIndex((row) => row.outgoing || row.service);
  const last = rows[end];
  let messages;
  try {
    messages = rows.slice(end + 1).map(({ id, body, links }) => ({
      id,
      body,
      ...messageLinkProperties(links),
    }));
    messageLinkProperties(last?.links);
  } catch {
    return { code: 'answer-history-unverified' };
  }
  const boundary = last
    ? {
        kind: last.service ? 'service' : 'outgoing',
        id: last.id,
        body: last.body,
        ...messageLinkProperties(last.links),
      }
    : { kind: 'rendered-start' };
  if (
    messages.length > 20 ||
    messages.reduce((size, row) => size + String(row.body ?? '').length, 0) >
      24000
  ) {
    return { code: 'answer-history-limited' };
  }
  const relevant = last ? [last, ...messages] : messages;
  if (
    relevant.some(
      (row) =>
        !validText(row.id, 480) || !validText(row.body, 6000, row === last)
    ) ||
    new Set(relevant.map((row) => row.id)).size !== relevant.length
  ) {
    return { code: 'answer-history-unverified' };
  }
  return { boundary, messages };
};

const samePendingQuestion = (latest, question) =>
  Boolean(latest) &&
  latest.id === question.id &&
  latest.body === question.body &&
  JSON.stringify(messageLinkProperties(latest.links)) ===
    JSON.stringify(messageLinkProperties(question.links)) &&
  Boolean(latest.outgoing) === question.outgoing &&
  !latest.service;

/** Old adapters may omit evidence; present evidence must be complete and coherent. */
export const checkedBrowserPendingTurn = (turn, question) => {
  if (turn === undefined) {
    return undefined;
  }
  const boundary = turn?.boundary;
  if (
    !Array.isArray(turn?.messages) ||
    turn.messages.length > 20 ||
    !['rendered-start', 'outgoing', 'service'].includes(boundary?.kind)
  ) {
    return null;
  }
  let rows;
  try {
    rows = turn.messages.map((row) => ({
      id: row?.id,
      body: row?.body,
      ...messageLinkProperties(row?.links),
    }));
    messageLinkProperties(question.links);
    messageLinkProperties(boundary.links);
  } catch {
    return null;
  }
  if (boundary.kind !== 'rendered-start') {
    rows.unshift({
      id: boundary.id,
      body: boundary.body,
      ...messageLinkProperties(boundary.links),
      outgoing: boundary.kind === 'outgoing',
      service: boundary.kind === 'service',
    });
  }
  const value = browserPendingTurn(rows);
  const latest = rows.at(-1);
  return !value.code && samePendingQuestion(latest, question) ? value : null;
};
