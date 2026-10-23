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
