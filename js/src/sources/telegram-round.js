// Round video messages, "video notes" (R-Y150; learned, never copied):
// the page records a square clip from the camera and uploads it; this
// builds what Telegram needs to show it as a circle — a document with
// DocumentAttributeVideo { roundMessage, duration, w, h } and no caption.

// A round video lasts a minute at most; its side is a square of up to
// 1280 pixels (Telegram's apps record 384 or 640).
export const MAX_ROUND_SECONDS = 60;
export const MAX_ROUND_SIDE = 1280;

const clamp = (value, min, max) =>
  Math.max(min, Math.min(max, Math.round(Number(value) || 0)));

const isMp4 = (name) => /\.mp4$/i.test(String(name ?? ''));

/** The mime type a clip's name says: MP4, else the WebM browsers record. */
export const roundMime = (name) => (isMp4(name) ? 'video/mp4' : 'video/webm');

/**
 * What the send needs of the page's words: whole seconds (1..60), the
 * square's side, the reply and when.
 */
export const roundOptions = ({
  duration = 0,
  size = 0,
  replyTo = null,
  silent = false,
  scheduleDate = null,
}) => ({
  seconds: clamp(duration, 1, MAX_ROUND_SECONDS),
  side: clamp(size || 240, 1, MAX_ROUND_SIDE),
  extra: {
    ...(replyTo ? { replyTo } : {}),
    ...(silent ? { silent: true } : {}),
    ...(scheduleDate ? { scheduleDate } : {}),
  },
});

/** The DocumentAttributeVideo of a round video. */
export const roundAttribute = (Api, options) =>
  new Api.DocumentAttributeVideo({
    roundMessage: true,
    supportsStreaming: true,
    duration: options.seconds,
    w: options.side,
    h: options.side,
  });

/** GramJS's sendFile options for a round video; no caption. */
export const roundFileOf = (upload, options) => (telegram) => {
  const CustomFile =
    telegram.client?.uploads?.CustomFile ?? telegram.CustomFile;
  const name = isMp4(upload.name) ? 'round.mp4' : 'round.webm';
  return {
    file: new CustomFile(name, upload.size, upload.path),
    forceDocument: false,
    mimeType: roundMime(name),
    attributes: [roundAttribute(telegram.Api, options)],
    clearDraft: true,
    ...options.extra,
  };
};
