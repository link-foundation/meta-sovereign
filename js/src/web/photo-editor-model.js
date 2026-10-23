// The photo editor's pure parts (R-Y187; Telegram Desktop's media editor,
// learned, never copied): crop rectangles and aspect ratios, rotation and
// flip, the stroke model and the undo stack. No canvas, no DOM: the
// dialog (./chat-photo-editor.js) draws what these describe.
//
// An edit is `{ turns, flip, crop, strokes }`. The picture is turned left
// `turns` quarter turns, then mirrored when `flip`; `crop` and every
// stroke's points are fractions (0…1) of that turned picture, so they
// survive resizing and the preview's scale.

export const MIN_CROP_PX = 24;

/** Aspect choices: width / height of the crop, `null` free, 'original'. */
export const RATIOS = [
  { id: 'free', ratio: null },
  { id: 'original', ratio: 'original' },
  { id: 'square', ratio: 1 },
  { id: '3:2', ratio: 3 / 2 },
  { id: '2:3', ratio: 2 / 3 },
  { id: '4:3', ratio: 4 / 3 },
  { id: '3:4', ratio: 3 / 4 },
  { id: '16:9', ratio: 16 / 9 },
  { id: '9:16', ratio: 9 / 16 },
];

export const ratioOf = (id, size) => {
  const found = RATIOS.find((r) => r.id === id);
  if (!found || found.ratio === null) {
    return null;
  }
  return found.ratio === 'original' ? size.w / size.h : found.ratio;
};

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

export const FULL = { x: 0, y: 0, w: 1, h: 1 };

export const initialEdit = () => ({
  turns: 0,
  flip: false,
  crop: { ...FULL },
  strokes: [],
});

/** The turned picture's size: quarter turns swap width and height. */
export const turnedSize = (size, turns) =>
  turns % 2 === 0 ? { w: size.w, h: size.h } : { w: size.h, h: size.w };

/** The crop in pixels of the turned picture (at least 1). */
export const cropPixels = (crop, size) => ({
  x: Math.round(crop.x * size.w),
  y: Math.round(crop.y * size.h),
  w: Math.max(1, Math.round(crop.w * size.w)),
  h: Math.max(1, Math.round(crop.h * size.h)),
});

/**
 * The biggest rectangle of `ratio` (width / height, in pixels) that fits
 * in `rect` (fractions of `size`), sharing its centre. `null` keeps it.
 */
export const fitRatio = (rect, ratio, size) => {
  if (!ratio) {
    return { ...rect };
  }
  const pw = rect.w * size.w;
  const ph = rect.h * size.h;
  const w = Math.min(pw, ph * ratio);
  const h = w / ratio;
  const fw = w / size.w;
  const fh = h / size.h;
  return {
    x: clamp(rect.x + (rect.w - fw) / 2, 0, 1 - fw),
    y: clamp(rect.y + (rect.h - fh) / 2, 0, 1 - fh),
    w: fw,
    h: fh,
  };
};

/** Dragging the whole crop by (dx, dy) fractions, kept inside. */
export const moveCrop = (rect, dx, dy) => ({
  ...rect,
  x: clamp(rect.x + dx, 0, 1 - rect.w),
  y: clamp(rect.y + dy, 0, 1 - rect.h),
});

const EDGES = {
  nw: { x: -1, y: -1 },
  n: { x: 0, y: -1 },
  ne: { x: 1, y: -1 },
  e: { x: 1, y: 0 },
  se: { x: 1, y: 1 },
  s: { x: 0, y: 1 },
  sw: { x: -1, y: 1 },
  w: { x: -1, y: 0 },
};

/** Handles a crop offers: all eight when free, the corners when locked. */
export const handlesFor = (ratio) =>
  ratio ? ['nw', 'ne', 'se', 'sw'] : Object.keys(EDGES);

// Free: each moved edge follows the pointer, kept inside and apart.
const resizeFree = (rect, dir, point, size) => {
  const minW = MIN_CROP_PX / size.w;
  const minH = MIN_CROP_PX / size.h;
  let { x, y } = rect;
  let right = rect.x + rect.w;
  let bottom = rect.y + rect.h;
  if (dir.x < 0) {
    x = clamp(point.x, 0, right - minW);
  } else if (dir.x > 0) {
    right = clamp(point.x, x + minW, 1);
  }
  if (dir.y < 0) {
    y = clamp(point.y, 0, bottom - minH);
  } else if (dir.y > 0) {
    bottom = clamp(point.y, y + minH, 1);
  }
  return { x, y, w: right - x, h: bottom - y };
};

// Locked: the opposite corner stays; the pointer picks the size, the
// ratio holds, and the room left on that side limits it.
const resizeLocked = (rect, dir, point, size, ratio) => {
  const ax = dir.x < 0 ? rect.x + rect.w : rect.x;
  const ay = dir.y < 0 ? rect.y + rect.h : rect.y;
  const room = {
    w: (dir.x < 0 ? ax : 1 - ax) * size.w,
    h: (dir.y < 0 ? ay : 1 - ay) * size.h,
  };
  const want = {
    w: Math.abs(point.x - ax) * size.w,
    h: Math.abs(point.y - ay) * size.h,
  };
  let w = Math.max(want.w, want.h * ratio, MIN_CROP_PX);
  w = Math.min(w, room.w, room.h * ratio);
  const fw = w / size.w;
  const fh = w / ratio / size.h;
  return {
    x: dir.x < 0 ? ax - fw : ax,
    y: dir.y < 0 ? ay - fh : ay,
    w: fw,
    h: fh,
  };
};

/**
 * The crop after a handle ('nw'…'w') is dragged to `point` (fractions of
 * `size`); `ratio` locks the shape (corners only).
 */
export const resizeCrop = (rect, handle, point, size, ratio = null) => {
  const dir = EDGES[handle];
  if (!dir) {
    return { ...rect };
  }
  return ratio && dir.x && dir.y
    ? resizeLocked(rect, dir, point, size, ratio)
    : resizeFree(rect, dir, point, size);
};

// One point or crop through "turn left" and "mirror".
const turnPoint = ([x, y]) => [y, 1 - x];
const flipPoint = ([x, y]) => [1 - x, y];

const turnCrop = (c) => ({ x: c.y, y: 1 - c.x - c.w, w: c.h, h: c.w });
const flipCrop = (c) => ({ ...c, x: 1 - c.x - c.w });

const mapStrokes = (strokes, fn) =>
  strokes.map((s) => ({ ...s, points: s.points.map(fn) }));

/** Rotate 90° to the left: the crop and the strokes turn with it. */
export const rotateLeft = (edit) => ({
  ...edit,
  // A mirrored picture turns the other way round when read from the file.
  turns: (edit.turns + (edit.flip ? 3 : 1)) % 4,
  crop: turnCrop(edit.crop),
  strokes: mapStrokes(edit.strokes, turnPoint),
});

/** Mirror left to right. */
export const flipHorizontal = (edit) => ({
  ...edit,
  flip: !edit.flip,
  crop: flipCrop(edit.crop),
  strokes: mapStrokes(edit.strokes, flipPoint),
});

export const setCrop = (edit, crop) => ({ ...edit, crop });

/** Did the edit change anything from an untouched picture? */
export const isEdited = (edit) =>
  edit.turns !== 0 ||
  edit.flip ||
  edit.strokes.length > 0 ||
  edit.crop.x !== 0 ||
  edit.crop.y !== 0 ||
  edit.crop.w !== 1 ||
  edit.crop.h !== 1;

export const TOOLS = ['crop', 'brush', 'marker', 'arrow', 'eraser'];

export const COLORS = [
  '#ff3b30',
  '#ff9500',
  '#ffd60a',
  '#34c759',
  '#0a84ff',
  '#af52de',
  '#ffffff',
  '#000000',
];

/** Brush sizes as fractions of the picture's longer side. */
export const SIZES = [0.004, 0.009, 0.018, 0.032];

const finite = (n) => (Number.isFinite(n) ? clamp(n, 0, 1) : 0);

/** A stroke: tool, colour, size and its points (fractions of 0…1). */
export const newStroke = (tool, color, width, point) => ({
  tool,
  color,
  width,
  points: [[finite(point.x), finite(point.y)]],
});

/** The stroke with one more point (an arrow keeps its two ends only). */
export const extendStroke = (stroke, point) => {
  const next = [finite(point.x), finite(point.y)];
  if (stroke.tool === 'arrow') {
    return { ...stroke, points: [stroke.points[0], next] };
  }
  const last = stroke.points[stroke.points.length - 1];
  if (last[0] === next[0] && last[1] === next[1]) {
    return stroke;
  }
  return { ...stroke, points: [...stroke.points, next] };
};

/** Does the stroke leave a mark (an arrow needs a length)? */
export const isMark = (stroke) =>
  stroke.tool === 'arrow' ? stroke.points.length === 2 : true;

/** Add a finished stroke to an edit. */
export const addStroke = (edit, stroke) => ({
  ...edit,
  strokes: [...edit.strokes, stroke],
});

/** The arrow head's two barbs for a line a→b in pixels. */
export const arrowHead = (a, b, length) => {
  const angle = Math.atan2(b.y - a.y, b.x - a.x);
  const spread = Math.PI / 7;
  return [angle + Math.PI - spread, angle + Math.PI + spread].map((turn) => ({
    x: b.x + Math.cos(turn) * length,
    y: b.y + Math.sin(turn) * length,
  }));
};

// The undo stack: `{ past, present, future }`, whole edits in each.
export const startHistory = (present) => ({ past: [], present, future: [] });

export const pushHistory = (history, present) => ({
  past: [...history.past, history.present],
  present,
  future: [],
});

export const canUndo = (history) => history.past.length > 0;
export const canRedo = (history) => history.future.length > 0;

export const undoHistory = (history) =>
  canUndo(history)
    ? {
        past: history.past.slice(0, -1),
        present: history.past[history.past.length - 1],
        future: [history.present, ...history.future],
      }
    : history;

export const redoHistory = (history) =>
  canRedo(history)
    ? {
        past: [...history.past, history.present],
        present: history.future[0],
        future: history.future.slice(1),
      }
    : history;

/** What the file becomes: JPEG stays JPEG, anything else is PNG. */
export const outputType = (mime) =>
  /^image\/jpe?g$/i.test(String(mime ?? '')) ? 'image/jpeg' : 'image/png';

/** The file name with the extension of the type it now is. */
export const outputName = (name, type) => {
  const base = String(name ?? 'photo');
  const ext = type === 'image/jpeg' ? /\.jpe?g$/i : /\.png$/i;
  if (ext.test(base)) {
    return base;
  }
  const stem = base.replace(/\.[^./\\]+$/, '');
  return `${stem}.${type === 'image/jpeg' ? 'jpg' : 'png'}`;
};

/** Pictures the editor can redraw (not GIFs, which would lose frames). */
export const isEditable = (mime) =>
  /^image\/(jpe?g|png|webp|bmp)$/i.test(String(mime ?? ''));
