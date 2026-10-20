// Each person and chat has one of Telegram's seven peer colours — the
// colour of their name above their messages, of the bar of a reply to
// them and of their avatar when it has no photo — as Telegram's own apps
// pick it (tweb `getPeerColorIndexById`, telegram-tt `getPeerColorKey`):
// the colour the peer chose when it is known, else its raw id modulo 7.
// Someone without a numeric id (another network's sender) is coloured by
// a hash of that id, so they keep one colour too. The colours themselves
// are app.css `.peer-color-N`.

export const PEER_COLORS = 7;

// The raw id of a marked Telegram id: a user's is itself, a basic
// group's `-N` is N, a channel's or supergroup's `-100N` is N.
const rawId = (id) => {
  const text = String(id);
  if (!/^-?\d+$/.test(text)) {
    return null;
  }
  const digits = text.startsWith('-100')
    ? text.slice(4)
    : text.replace('-', '');
  return digits ? BigInt(digits) : null;
};

const hashOf = (text) => {
  let hash = 0;
  for (const ch of text) {
    hash = (hash * 31 + ch.codePointAt(0)) >>> 0;
  }
  return hash;
};

/** The peer colour (0..6) of `id`, or of `name` when there is no id. */
export const peerColorIndex = (id, { name, color } = {}) => {
  if (Number.isInteger(color) && color >= 0 && color < PEER_COLORS) {
    return color;
  }
  const raw = id === 'me' || id === null || id === undefined ? null : rawId(id);
  if (raw !== null) {
    return Number(raw % BigInt(PEER_COLORS));
  }
  return hashOf(String(id ?? name ?? '')) % PEER_COLORS;
};

/** The class that gives an element its peer's colours (app.css). */
export const peerColorClass = (id, options) =>
  `peer-color-${peerColorIndex(id, options)}`;
