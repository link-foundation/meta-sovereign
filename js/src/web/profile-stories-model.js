// Pure helpers of the profile's stories (R-Y185; learned, never copied).

/** The stories fixed on top first, the others as they came. */
export const storiesInOrder = (stories) => [
  ...stories.filter((s) => s.top),
  ...stories.filter((s) => !s.top),
];

/** The ids of the stories fixed on top, in the order shown. */
export const topIds = (stories) =>
  storiesInOrder(stories)
    .filter((s) => s.top)
    .map((s) => s.id);

/** Whether a chat id names a person or a channel, whose stories show. */
export const storyChat = (chat) => /^(\d+|-100\d+)$/.test(String(chat ?? ''));

/** A song's line: "Title — Performer", else the file's name. */
export const trackLine = (track) =>
  [track.title, track.performer].filter(Boolean).join(' — ') ||
  track.name ||
  '';

/**
 * A gift catalogue ordered as Telegram Desktop lists it: the ones still on
 * sale first (by their position), the sold-out last.
 */
export const catalogueOrder = (gifts) => [
  ...gifts.filter((g) => !g.soldOut),
  ...gifts.filter((g) => g.soldOut),
];

/** The message of a gift as it is sent: trimmed, and at most `max` long. */
export const giftText = (value, max = 255) =>
  String(value ?? '')
    .trim()
    .slice(0, max);
