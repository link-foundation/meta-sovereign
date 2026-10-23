// A live location in a chat (R-Y142; learned, never copied): until when it
// is shared, how long ago it moved, and whether its author may stop it.

const timeOf = (seconds) =>
  new Date(seconds * 1000).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

/** Whether the live place is still shared at `now` (seconds). */
export const liveActive = (media, now) =>
  Boolean(media?.live) && (!media.until || media.until > now);

/** "Updated 5 min ago" and "until 14:30" (or "ended"), as lines. */
export const liveLines = (t, media, now) => {
  const lines = [];
  if (media.updated) {
    const minutes = Math.max(0, Math.floor((now - media.updated) / 60));
    lines.push(
      minutes < 1
        ? t('chat.media.liveNow')
        : minutes < 60
          ? t('chat.media.liveMinutes', { count: minutes })
          : t('chat.media.liveHours', { count: Math.floor(minutes / 60) })
    );
  }
  if (media.until) {
    lines.push(
      liveActive(media, now)
        ? t('chat.media.liveUntil', { time: timeOf(media.until) })
        : t('chat.media.liveEnded')
    );
  }
  return lines;
};

/** The own live location message that can be stopped (its menu item). */
export const canStopLive = (message, now = Date.now() / 1000) => {
  const media = message?.raw?.media;
  if (
    media?.className !== 'MessageMediaGeoLive' ||
    !message.raw.out ||
    message.source !== 'telegram' ||
    message.pending
  ) {
    return false;
  }
  const period = Number(media.period) || 0;
  const sent = Number(message.raw.date) || 0;
  return !period || !sent || sent + period > now;
};

// ---- R-Y197: time left, heading, who shares in a chat ---------------------

// Telegram's period for a place shared until it is stopped.
const NO_END = 0x7f_ff_ff_ff;

/** The time left of a live place at `now` (seconds): `{ unit, count }`. */
export const timeLeft = (media, now) => {
  if (!liveActive(media, now) || !media.until || media.until >= NO_END) {
    return null;
  }
  const minutes = Math.max(1, Math.ceil((media.until - now) / 60));
  return minutes < 60
    ? { unit: 'min', count: minutes }
    : { unit: 'h', count: Math.ceil(minutes / 60) };
};

/** "12 min left" / "2 h left" for a live place, or null. */
export const leftLine = (t, media, now) => {
  const left = timeLeft(media, now);
  if (!left) {
    return null;
  }
  const key =
    left.unit === 'min' ? 'chat.media.liveLeftMin' : 'chat.media.liveLeftH';
  return t(key, { count: left.count });
};

/** A heading as degrees clockwise from north (0..359), or null. */
export const headingDegrees = (media) => {
  const degrees = Number(media?.heading);
  return Number.isFinite(degrees) && degrees > 0 ? degrees % 360 : null;
};

const digits = (value) => {
  const text = String(value?.value ?? value ?? '');
  return /^-?\d{1,20}$/.test(text) ? text : undefined;
};

// The message's live media, or null when it is not a live place, is not
// sent yet or was stopped here.
const liveMediaOf = (message, isStopped) => {
  const media = message?.raw?.media;
  if (
    media?.className !== 'MessageMediaGeoLive' ||
    message.pending ||
    !Number.isFinite(Number(media.geo?.lat)) ||
    !Number.isFinite(Number(media.geo?.long)) ||
    isStopped(message)
  ) {
    return null;
  }
  return media;
};

// Who shares the place: us, or the sender (a key and a name).
const whoOf = (message) =>
  message.raw.out
    ? { own: true, who: 'me', name: '' }
    : {
        own: false,
        who: String(message.sender ?? ''),
        name: message.senderName ?? message.chatName ?? '',
      };

// Seconds the place is shared until; 0 when until it is stopped.
const endOf = (media, sent) => {
  const period = Number(media.period) || 0;
  return period && sent && period < NO_END ? sent + period : 0;
};

/**
 * One live place from a message, or null when it is not one or has ended
 * at `now`: who shares it, where, its heading, until when (seconds; 0:
 * until stopped) and when it last moved.
 */
export const shareOf = (message, now, isStopped = () => false) => {
  const media = liveMediaOf(message, isStopped);
  const raw = message?.raw;
  const sent = Number(raw?.date) || 0;
  const until = media ? endOf(media, sent) : 0;
  if (!media || (until && until <= now)) {
    return null;
  }
  return {
    id: message.id,
    ...whoOf(message),
    lat: Number(media.geo.lat),
    lon: Number(media.geo.long),
    hash: digits(media.geo?.accessHash),
    heading: media.heading ? Number(media.heading) : null,
    radius: Number(media.proximityNotificationRadius) || 0,
    until,
    updated: Number(raw.editDate) || sent,
    live: true,
  };
};

/**
 * The live places being shared in a chat at `now`: the newest of each
 * person, ours first, then the latest moved first.
 */
export const activeShares = (messages, now, isStopped) => {
  const latest = new Map();
  for (const message of messages ?? []) {
    const share = shareOf(message, now, isStopped);
    const known = latest.get(share?.who);
    if (share && (!known || share.updated >= known.updated)) {
      latest.set(share.who, share);
    }
  }
  return [...latest.values()].sort(
    (a, b) => Number(b.own) - Number(a.own) || b.updated - a.updated
  );
};

/** A distance in metres as `{ unit: 'm' | 'km', value }`. */
export const distanceParts = (meters) => {
  const m = Math.max(0, Math.round(Number(meters) || 0));
  return m < 1000
    ? { unit: 'm', value: m }
    : { unit: 'km', value: Math.round(m / 100) / 10 };
};
