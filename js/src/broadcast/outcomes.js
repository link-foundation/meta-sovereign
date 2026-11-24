// A dispatched attempt is not proof of delivery. Preserve each result and
// derive only the aggregate state that those results actually establish.
export const broadcastResultState = (result) => {
  if (result.ok === true) {
    return 'sent';
  }
  if (result.status === 'unknown' || result.outcome === 'unknown') {
    return 'unknown';
  }
  if (result.queued === true || result.status === 'queued') {
    return 'queued';
  }
  return 'failed';
};

export const broadcastOutcome = (results = []) => {
  const counts = { sent: 0, failed: 0, unknown: 0, queued: 0 };
  for (const result of results) {
    counts[broadcastResultState(result)]++;
  }
  let status = 'failed';
  if (counts.sent === results.length && results.length) {
    status = 'sent';
  } else if (counts.sent) {
    status = 'partial';
  } else if (counts.unknown) {
    status = 'unknown';
  } else if (counts.queued) {
    status = 'queued';
  }
  if (globalThis.process?.env?.META_SOVEREIGN_BROADCAST_DEBUG === '1') {
    console.error('[broadcast-outcome]', { status, ...counts });
  }
  return { status, counts };
};
