/** The complete bounded incoming suffix of rendered history, never provider coverage. */
export const browserPendingTurn = (rows) => {
  const validText = (value, limit, empty = false) =>
    typeof value === 'string' &&
    value.length <= limit &&
    (empty || Boolean(value.trim()));
  const end = rows.findLastIndex((row) => row.outgoing || row.service);
  const last = rows[end];
  const messages = rows.slice(end + 1).map(({ id, body }) => ({ id, body }));
  const boundary = last
    ? {
        kind: last.service ? 'service' : 'outgoing',
        id: last.id,
        body: last.body,
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
  const rows = turn.messages.map((row) => ({ id: row?.id, body: row?.body }));
  if (boundary.kind !== 'rendered-start') {
    rows.unshift({
      id: boundary.id,
      body: boundary.body,
      outgoing: boundary.kind === 'outgoing',
      service: boundary.kind === 'service',
    });
  }
  const value = browserPendingTurn(rows);
  const latest = rows.at(-1);
  return !value.code &&
    latest?.id === question.id &&
    latest.body === question.body &&
    Boolean(latest.outgoing) === question.outgoing &&
    !latest.service
    ? value
    : null;
};
