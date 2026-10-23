// The photo editor's canvas drawing (R-Y187; learned, never copied):
// the turned picture, the strokes over it, the crop cut out, and the
// blob that replaces the file. What is drawn comes from the pure model
// (./photo-editor-model.js).

import {
  arrowHead,
  cropPixels,
  outputName,
  outputType,
  turnedSize,
} from './photo-editor-model.js';

const makeCanvas = (w, h) => {
  const canvas = globalThis.document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w));
  canvas.height = Math.max(1, Math.round(h));
  return canvas;
};

const MARKER = { alpha: 0.45, grow: 2.6 };
const ERASER_GROW = 2.2;

const pixel = (point, w, h) => ({ x: point[0] * w, y: point[1] * h });

const drawLine = (ctx, points, w, h) => {
  ctx.beginPath();
  points.forEach((p, i) => {
    const at = pixel(p, w, h);
    return i === 0 ? ctx.moveTo(at.x, at.y) : ctx.lineTo(at.x, at.y);
  });
  if (points.length === 1) {
    const at = pixel(points[0], w, h);
    ctx.lineTo(at.x + 0.01, at.y);
  }
  ctx.stroke();
};

const drawArrow = (ctx, stroke, w, h, px) => {
  const [a, b] = stroke.points.map((p) => pixel(p, w, h));
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  const [left, right] = arrowHead(a, b, px * 4);
  ctx.beginPath();
  ctx.moveTo(left.x, left.y);
  ctx.lineTo(b.x, b.y);
  ctx.lineTo(right.x, right.y);
  ctx.stroke();
};

// One stroke on the strokes' own layer (so the eraser takes only strokes).
const drawStroke = (ctx, stroke, w, h) => {
  const base = stroke.width * Math.max(w, h);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = stroke.color;
  ctx.lineWidth = base;
  if (stroke.tool === 'marker') {
    ctx.globalAlpha = MARKER.alpha;
    ctx.lineWidth = base * MARKER.grow;
    ctx.lineCap = 'butt';
  } else if (stroke.tool === 'eraser') {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.lineWidth = base * ERASER_GROW;
  }
  if (stroke.tool === 'arrow') {
    if (stroke.points.length === 2) {
      drawArrow(ctx, stroke, w, h, base);
    }
  } else {
    drawLine(ctx, stroke.points, w, h);
  }
  ctx.restore();
};

/**
 * Paint the turned and mirrored picture with its strokes into `ctx`, a
 * canvas of `w`×`h` (the turned picture's proportions). `bitmap` is the
 * original; `live` an unfinished stroke.
 */
export const paintTurned = (ctx, bitmap, edit, w, h, live = null) => {
  ctx.save();
  ctx.clearRect(0, 0, w, h);
  ctx.translate(w / 2, h / 2);
  if (edit.flip) {
    ctx.scale(-1, 1);
  }
  ctx.rotate((-edit.turns * Math.PI) / 2);
  const sw = edit.turns % 2 === 0 ? w : h;
  const sh = edit.turns % 2 === 0 ? h : w;
  ctx.drawImage(bitmap, -sw / 2, -sh / 2, sw, sh);
  ctx.restore();
  const strokes = live ? [...edit.strokes, live] : edit.strokes;
  if (strokes.length > 0) {
    const layer = makeCanvas(w, h);
    const lctx = layer.getContext('2d');
    strokes.forEach((stroke) => drawStroke(lctx, stroke, w, h));
    ctx.drawImage(layer, 0, 0);
  }
};

/** The largest size of `size`'s proportions that fits `maxW`×`maxH`. */
export const fitBox = (size, maxW, maxH) => {
  const scale = Math.min(maxW / size.w, maxH / size.h, 1);
  return {
    w: Math.max(1, Math.round(size.w * scale)),
    h: Math.max(1, Math.round(size.h * scale)),
  };
};

const toBlob = (canvas, type) =>
  new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('no picture'))),
      type,
      0.92
    )
  );

/**
 * The edited picture as a File named like the original (R-Y187): JPEG
 * stays JPEG, anything else becomes PNG (the extension follows).
 */
export const renderEdited = async (bitmap, edit, original) => {
  const full = turnedSize({ w: bitmap.width, h: bitmap.height }, edit.turns);
  const canvas = makeCanvas(full.w, full.h);
  paintTurned(canvas.getContext('2d'), bitmap, edit, full.w, full.h);
  const crop = cropPixels(edit.crop, full);
  const out = makeCanvas(crop.w, crop.h);
  const type = outputType(original.type);
  const octx = out.getContext('2d');
  if (type === 'image/jpeg') {
    octx.fillStyle = '#fff';
    octx.fillRect(0, 0, crop.w, crop.h);
  }
  octx.drawImage(canvas, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h);
  const blob = await toBlob(out, type);
  return new globalThis.File([blob], outputName(original.name, type), {
    type,
    lastModified: Date.now(),
  });
};
