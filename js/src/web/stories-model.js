// The pure parts of viewing stories (R-Y140; learned, never copied): who
// has unread ones, the strip's order, where the viewer starts and goes
// next, how old a story is. Nothing here draws or asks the server.

/** A photo story shows this long; a video plays to its end. */
export const PHOTO_MS = 5000;

/** Whether a peer's strip entry has stories not yet seen (never one's own). */
export const hasUnread = (peer) =>
  Boolean(peer) && !peer.self && Number(peer.maxReadId) < Number(peer.lastId);

/** The user's own first, then unread ones, then the seen; else as sent. */
export const orderStrip = (peers) => {
  const rank = (p) => (p.self ? 0 : hasUnread(p) ? 1 : 2);
  return peers
    .map((peer, i) => ({ peer, i }))
    .sort((a, b) => rank(a.peer) - rank(b.peer) || a.i - b.i)
    .map(({ peer }) => peer);
};

/** A page of the strip added to those held: a peer only once, the newest data. */
export const mergePeers = (held, page) => {
  const byId = new Map(held.map((p) => [p.peer, p]));
  for (const peer of page) {
    byId.set(peer.peer, peer);
  }
  return orderStrip([...byId.values()]);
};

/** Peers seen up to `id`: their mark moves forward, never back. */
export const markSeen = (peers, peerId, id) =>
  peers.map((p) =>
    p.peer === peerId && id > Number(p.maxReadId)
      ? { ...p, maxReadId: id, unread: hasUnread({ ...p, maxReadId: id }) }
      : p
  );

/** The ids of the peers with unread stories (rings on the chat list). */
export const unreadPeers = (peers) =>
  new Set(peers.filter(hasUnread).map((p) => p.peer));

/** Where a peer's stories begin: the first not yet seen, else the first. */
export const startIndex = (stories, maxReadId) => {
  const at = stories.findIndex((s) => s.id > Number(maxReadId));
  return at < 0 ? 0 : at;
};

/**
 * After a story: the next one of the peer, else the first of the next
 * peer (`storyIndex: null`, chosen when it is loaded), else null — the
 * viewer closes.
 */
export const nextPosition = (pos, storyCount, peerCount) => {
  if (pos.storyIndex + 1 < storyCount) {
    return { peerIndex: pos.peerIndex, storyIndex: pos.storyIndex + 1 };
  }
  return pos.peerIndex + 1 < peerCount
    ? { peerIndex: pos.peerIndex + 1, storyIndex: null }
    : null;
};

/**
 * Before a story: the one before it, else the last of the previous peer
 * (`'last'`), else the first again.
 */
export const previousPosition = (pos) => {
  if (pos.storyIndex > 0) {
    return { peerIndex: pos.peerIndex, storyIndex: pos.storyIndex - 1 };
  }
  return pos.peerIndex > 0
    ? { peerIndex: pos.peerIndex - 1, storyIndex: 'last' }
    : { peerIndex: pos.peerIndex, storyIndex: 0 };
};

/** How long a story shows: a photo's time, a video's own length (or null). */
export const showMs = (story, photoMs = PHOTO_MS) => {
  if (story?.media?.kind === 'video') {
    return story.media.duration ? story.media.duration * 1000 : null;
  }
  return photoMs;
};

/** `{ unit, count }` for "just now", "5 min ago", "2 h ago", "3 d ago". */
export const agoParts = (nowSec, dateSec) => {
  const seconds = Math.max(0, nowSec - dateSec);
  if (seconds < 60) {
    return { unit: 'now', count: 0 };
  }
  if (seconds < 3600) {
    return { unit: 'minutes', count: Math.floor(seconds / 60) };
  }
  if (seconds < 86_400) {
    return { unit: 'hours', count: Math.floor(seconds / 3600) };
  }
  return { unit: 'days', count: Math.floor(seconds / 86_400) };
};

// ---- Story interactions (R-Y148; learned, never copied) ----

/** The reactions the small picker offers; the first is the quick like. */
export const STORY_REACTIONS = ['❤', '👍', '🔥', '🎉', '😍', '😢', '😁', '👎'];

/** The quick like. */
export const LIKE = STORY_REACTIONS[0];

/**
 * The reaction a press leaves: pressing the one already there takes it
 * back (`''`, sent as ReactionEmpty), else the pressed one.
 */
export const reactionAfter = (current, pressed) =>
  current === pressed ? '' : pressed;

/** The peers shown in the strip (not hidden) and in the hidden list. */
export const visiblePeers = (peers) => peers.filter((p) => !p.hidden);
export const hiddenPeers = (peers) => peers.filter((p) => p.hidden);

/** A peer moved to (or from) the hidden list. */
export const setHidden = (peers, peerId, hidden) =>
  orderStrip(peers.map((p) => (p.peer === peerId ? { ...p, hidden } : p)));

/**
 * The ring a chat row gets: 'unread' while some stories are unseen,
 * 'seen' when there are only seen ones, '' for none (hidden stories and
 * one's own have none).
 */
export const ringOf = (peers, peerId) => {
  const peer = peers.find((p) => p.peer === peerId);
  if (!peer || peer.hidden || peer.self) {
    return '';
  }
  return hasUnread(peer) ? 'unread' : 'seen';
};

/** Own stories' viewers shown after a page: the new ones joined, once each. */
export const joinViews = (held, page) => {
  const seen = new Set(held.map((v) => v.user));
  return [...held, ...page.filter((v) => !seen.has(v.user))];
};
