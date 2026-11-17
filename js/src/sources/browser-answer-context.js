/** Captured rows are oldest first. Missing dates never imply recent context. */
export const browserAnswerRecent = ({ messages, question }) => {
  if (messages === undefined) {
    return undefined;
  }
  const valid = (row) =>
    typeof row?.id === 'string' &&
    Boolean(row.id.trim()) &&
    row.id.length <= 480 &&
    typeof row.body === 'string' &&
    row.body.length <= 6000 &&
    typeof row.outgoing === 'boolean';
  const latest = Array.isArray(messages) && messages.at(-1);
  const verified = () =>
    Array.isArray(messages) &&
    messages.length <= 500 &&
    messages.every(valid) &&
    new Set(messages.map((row) => row.id)).size === messages.length &&
    latest &&
    latest.id === question?.id &&
    latest.body === question.body &&
    latest.outgoing === question.outgoing &&
    !latest.service;
  if (!verified()) {
    return null;
  }
  const time = (value) => {
    if (typeof value !== 'string' || !value || value.length > 80) {
      return NaN;
    }
    if (/^\d{10,13}$/u.test(value)) {
      const number = Number(value);
      return value.length === 10 ? number * 1000 : number;
    }
    return Date.parse(value);
  };
  const at = time(latest.timestamp);
  const recent = [];
  let previous = at;
  const blocked = (row) =>
    row.service ||
    row.deleted ||
    row.pending ||
    row.failed ||
    ['unknown', 'failed', 'pending', 'sending'].includes(
      row.delivery ?? row.status
    );
  for (const row of messages.slice(-21, -1).toReversed()) {
    const when = time(row.timestamp);
    if (
      !Number.isFinite(at) ||
      !Number.isFinite(when) ||
      when > previous ||
      at - when > 86400000 ||
      blocked(row)
    ) {
      break;
    }
    recent.push({ text: row.body, evidence: `browser:${row.id}` });
    previous = when;
  }
  return recent;
};
