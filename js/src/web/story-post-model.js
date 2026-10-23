// The pure parts of posting a story (R-Y156; learned, never copied): what
// kind of file it is, whom it is for, how long it lasts, what the server
// is asked and which words an answer gets. Nothing here draws or asks.

/** Telegram allows a story video of a minute at most. */
export const MAX_VIDEO_SECONDS = 60;
/** The caption's length without Premium (Desktop); Premium's comes from the server. */
export const CAPTION_MAX = 200;

/** Whom a story is for, in the order the dialog lists them. */
export const PRIVACY_CHOICES = [
  { key: 'everyone', label: 'chat.storyPost.everyone' },
  { key: 'contacts', label: 'chat.storyPost.contacts' },
  { key: 'close-friends', label: 'chat.storyPost.closeFriends' },
  { key: 'selected', label: 'chat.storyPost.selected' },
];

/** The hours a story may last (Premium chooses), with their seconds. */
export const PERIOD_CHOICES = [6, 12, 24, 48].map((hours) => ({
  hours,
  seconds: hours * 3600,
}));
export const DEFAULT_PERIOD = 86_400;

const VIDEO_NAME = /\.(mp4|m4v|mov|webm)$/i;
const IMAGE_NAME = /\.(jpe?g|png|webp|heic|heif|bmp)$/i;

/** 'photo', 'video', or null for a file a story cannot be made of. */
export const kindOf = (file) => {
  const type = String(file?.type ?? '');
  const name = String(file?.name ?? '');
  if (type.startsWith('video/') || (!type && VIDEO_NAME.test(name))) {
    return 'video';
  }
  if (type.startsWith('image/') || (!type && IMAGE_NAME.test(name))) {
    return 'photo';
  }
  return null;
};

/** The caption's limit the server told, else Desktop's 200. */
export const captionLimit = (info) =>
  Number.isInteger(info?.captionMax) && info.captionMax > 0
    ? info.captionMax
    : CAPTION_MAX;

/** Characters, as Telegram counts them. */
export const lengthOf = (text) => Array.from(String(text ?? '')).length;

/** What stops a post before it is asked, as a code, or null. */
export const problemOf = ({
  kind,
  duration,
  privacy,
  users,
  caption,
  info,
}) => {
  if (kind === 'video' && Number(duration) > MAX_VIDEO_SECONDS) {
    return 'video-too-long';
  }
  if (privacy === 'selected' && users.length === 0) {
    return 'users-invalid';
  }
  return lengthOf(caption) > captionLimit(info) ? 'caption-too-long' : null;
};

/**
 * The code a "can I post" answer gives when the user may not: its own
 * code, else 'failed'; null when posting is allowed.
 */
export const limitOf = (answer) => {
  if (answer?.ok && answer.remains !== 0) {
    return null;
  }
  return answer?.ok ? 'too-many' : (answer?.code ?? 'failed');
};

/** The server's request for a post; the period only when Premium chose one. */
export const postBody = ({ token, kind, options, meta, info }) => ({
  token,
  kind,
  caption: options.caption.trim(),
  privacy: options.privacy,
  users: options.privacy === 'selected' ? [...options.users] : [],
  screenshots: options.screenshots,
  pinned: options.pinned,
  ...(info?.premium && options.period !== DEFAULT_PERIOD
    ? { period: options.period }
    : {}),
  ...(kind === 'video'
    ? {
        duration: Number(meta.duration),
        width: Math.round(meta.width),
        height: Math.round(meta.height),
      }
    : {}),
});

/** The locale key of the words for a code. */
export const errorKey = (code) =>
  [
    'too-many',
    'premium',
    'media-invalid',
    'video-too-long',
    'flood',
    'users-invalid',
    'caption-too-long',
  ].includes(code)
    ? `chat.storyPost.err.${code}`
    : 'chat.storyPost.err.failed';
