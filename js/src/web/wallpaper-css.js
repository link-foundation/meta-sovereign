// A chat background as CSS (R-Y155; learned, never copied): the pure part
// of chat-wallpaper.js. A background is chosen as one of
//   { kind: 'none' }
//   { kind: 'telegram', wallpaper: <page shape of a WallPaper> }
//   { kind: 'file', dataUrl }       (a picture from this device)
// and drawn by a layer behind the messages whose look is set through CSS
// custom properties (--wp-gradient, --wp-image, --wp-pattern,
// --wp-pattern-opacity, --wp-pattern-invert), so the messages scrolling
// over it cost the browser nothing extra.

const HEX = /^#[0-9a-f]{6}$/i;
const ID = /^-?\d{1,20}$/;
const SLUG = /^[A-Za-z0-9_-]{0,64}$/;
const KINDS = ['image', 'pattern', 'colors'];
// Without colours of its own a pattern lies on a quiet grey-blue.
const FALLBACK = ['#9fb4c7'];
const MAX_DATA_URL = 4 * 1024 * 1024;

const solid = (colour) => `linear-gradient(${colour}, ${colour})`;

// Where a free-form gradient's colours sit, corner by corner.
const SPOTS = ['0% 0%', '100% 0%', '100% 100%', '0% 100%'];

/**
 * The CSS background-image for a wallpaper's colours: one colour solid,
 * two a linear gradient (Telegram's rotation is clockwise from "first
 * colour on top", so CSS gets 180 + rotation), three or four a free-form
 * blend of soft spots over the first colour. '' for no colours.
 */
export const gradientCss = (colors, rotation = 0) => {
  const list = (colors ?? []).filter((c) => HEX.test(String(c)));
  if (list.length === 0) {
    return '';
  }
  if (list.length === 1) {
    return solid(list[0]);
  }
  if (list.length === 2) {
    const angle = (((180 + Number(rotation || 0)) % 360) + 360) % 360;
    return `linear-gradient(${angle}deg, ${list[0]}, ${list[1]})`;
  }
  const spots = list.map(
    (colour, i) =>
      `radial-gradient(circle at ${SPOTS[i]}, ${colour} 0, transparent 75%)`
  );
  return [...spots, solid(list[0])].join(', ');
};

/** The pattern's opacity (0..1) and whether it is drawn light (dark theme). */
export const patternLook = (intensity) => {
  const n = Number(intensity) || 0;
  return {
    opacity: Math.min(1, Math.abs(n) / 100) || 0.4,
    invert: n < 0,
  };
};

const cssUrl = (url) =>
  `url("${String(url).replace(/["\\\n\r]/g, (c) => encodeURIComponent(c))}")`;

// `{ [name]: value }` when there is a value, else nothing.
const given = (name, value) => (value ? { [name]: value } : {});

/**
 * The custom properties of a choice (`{}` for none). `urls` is
 * `{ image }` for a picture or a pattern's file, once known.
 */
export const backgroundVars = (choice, urls = {}) => {
  if (choice?.kind === 'file' && choice.dataUrl) {
    return { '--wp-image': cssUrl(choice.dataUrl) };
  }
  const wp = choice?.kind === 'telegram' ? choice.wallpaper : null;
  if (!wp) {
    return {};
  }
  const gradient = gradientCss(wp.colors, wp.rotation);
  if (wp.kind === 'pattern') {
    const { opacity, invert } = patternLook(wp.intensity);
    return {
      '--wp-gradient': gradient || gradientCss(FALLBACK),
      ...given('--wp-pattern', urls.image && cssUrl(urls.image)),
      '--wp-pattern-opacity': String(opacity),
      '--wp-pattern-invert': invert ? '1' : '0',
    };
  }
  return {
    ...given('--wp-gradient', gradient),
    ...given(
      '--wp-image',
      wp.kind === 'image' && urls.image && cssUrl(urls.image)
    ),
  };
};

/** What the layer says of its kind: none, image, pattern or colors. */
export const layerKind = (choice) => {
  if (choice?.kind === 'file' && choice.dataUrl) {
    return 'image';
  }
  return choice?.kind === 'telegram' && choice.wallpaper
    ? choice.wallpaper.kind
    : 'none';
};

const validWallpaper = (wp) =>
  Boolean(wp) &&
  typeof wp === 'object' &&
  ID.test(String(wp.id ?? '')) &&
  KINDS.includes(wp.kind) &&
  SLUG.test(String(wp.slug ?? '')) &&
  Array.isArray(wp.colors) &&
  wp.colors.length <= 4 &&
  wp.colors.every((c) => HEX.test(String(c)));

const cleanWallpaper = (wp) => ({
  id: String(wp.id),
  slug: String(wp.slug ?? ''),
  kind: wp.kind,
  dark: Boolean(wp.dark),
  colors: wp.colors.map(String),
  rotation: Number(wp.rotation) || 0,
  intensity: Number(wp.intensity) || 0,
  file: wp.kind !== 'colors',
});

/** A stored choice checked; anything unknown becomes none. */
export const cleanChoice = (value) => {
  if (value?.kind === 'telegram' && validWallpaper(value.wallpaper)) {
    return { kind: 'telegram', wallpaper: cleanWallpaper(value.wallpaper) };
  }
  if (
    value?.kind === 'file' &&
    typeof value.dataUrl === 'string' &&
    /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(
      value.dataUrl
    ) &&
    value.dataUrl.length <= MAX_DATA_URL
  ) {
    return { kind: 'file', dataUrl: value.dataUrl };
  }
  return { kind: 'none' };
};

/** Whether two choices are the same background. */
export const sameChoice = (a, b) =>
  a?.kind === b?.kind &&
  (a?.kind === 'telegram'
    ? a.wallpaper?.id === b.wallpaper?.id
    : a?.kind !== 'file' || a.dataUrl === b.dataUrl);

/**
 * A wallpaper page shape from the server (a chat's own, or the list's) as
 * a choice; none when it is not valid.
 */
export const choiceOf = (wallpaper) =>
  validWallpaper(wallpaper)
    ? { kind: 'telegram', wallpaper: cleanWallpaper(wallpaper) }
    : { kind: 'none' };
