// A failed API query says nothing about whether an archive exists.
export async function waybackState(response) {
  if (!response.ok) {
    return { state: 'unknown', reason: `Wayback HTTP ${response.status}` };
  }
  let data;
  try {
    data = await response.json();
  } catch {
    return { state: 'unknown', reason: 'Invalid Wayback JSON' };
  }
  if (
    !data?.archived_snapshots ||
    typeof data.archived_snapshots !== 'object' ||
    Array.isArray(data.archived_snapshots)
  ) {
    return { state: 'unknown', reason: 'Malformed Wayback response' };
  }
  const closest = data.archived_snapshots.closest;
  if (!closest || closest.available === false) {
    return { state: 'missing' };
  }
  if (
    closest.available !== true ||
    !/^https?:\/\/web\.archive\.org\/web\//.test(closest.url) ||
    !/^\d{14}$/.test(closest.timestamp)
  ) {
    return { state: 'unknown', reason: 'Malformed Wayback snapshot' };
  }
  return {
    state: 'available',
    archiveUrl: closest.url.replace(/^http:/, 'https:'),
    timestamp: closest.timestamp,
  };
}
