// The photo editor's pure parts (R-Y187): crop maths with ratios and
// bounds, turning and mirroring, the stroke model and the undo stack.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addStroke,
  arrowHead,
  canRedo,
  canUndo,
  cropPixels,
  extendStroke,
  fitRatio,
  flipHorizontal,
  handlesFor,
  initialEdit,
  isEditable,
  isEdited,
  isMark,
  moveCrop,
  newStroke,
  outputName,
  outputType,
  pushHistory,
  ratioOf,
  redoHistory,
  resizeCrop,
  rotateLeft,
  setCrop,
  startHistory,
  turnedSize,
  undoHistory,
} from '../src/web/photo-editor-model.js';

const SIZE = { w: 400, h: 200 };
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} vs ${b}`);

test('ratios: free, original and the named ones', () => {
  assert.equal(ratioOf('free', SIZE), null);
  assert.equal(ratioOf('original', SIZE), 2);
  assert.equal(ratioOf('square', SIZE), 1);
  near(ratioOf('9:16', SIZE), 9 / 16);
  assert.equal(ratioOf('nope', SIZE), null);
});

test('fitRatio: the biggest centred rectangle of the ratio', () => {
  const square = fitRatio({ x: 0, y: 0, w: 1, h: 1 }, 1, SIZE);
  assert.deepEqual(cropPixels(square, SIZE), { x: 100, y: 0, w: 200, h: 200 });
  const wide = fitRatio({ x: 0, y: 0, w: 1, h: 1 }, 16 / 9, { w: 300, h: 300 });
  near((wide.w * 300) / (wide.h * 300), 16 / 9);
  assert.ok(wide.y > 0 && wide.x === 0);
  assert.deepEqual(fitRatio(FULL(), null, SIZE), FULL());
});
const FULL = () => ({ x: 0, y: 0, w: 1, h: 1 });

test('moveCrop keeps the crop inside the picture', () => {
  const r = { x: 0.2, y: 0.2, w: 0.5, h: 0.5 };
  assert.deepEqual(moveCrop(r, 0.9, -0.9), { x: 0.5, y: 0, w: 0.5, h: 0.5 });
  near(moveCrop(r, 0.1, 0.1).x, 0.3);
});

test('resizeCrop free: edges follow the pointer, inside and apart', () => {
  const r = { x: 0.25, y: 0.25, w: 0.5, h: 0.5 };
  const left = resizeCrop(r, 'w', { x: -3, y: 0.5 }, SIZE);
  assert.deepEqual([left.x, left.w, left.y, left.h], [0, 0.75, 0.25, 0.5]);
  const squeezed = resizeCrop(r, 'e', { x: 0, y: 0 }, SIZE);
  near(squeezed.w, 24 / 400);
  const corner = resizeCrop(r, 'se', { x: 2, y: 2 }, SIZE);
  assert.deepEqual([corner.w, corner.h], [0.75, 0.75]);
  assert.deepEqual(resizeCrop(r, 'bogus', { x: 0, y: 0 }, SIZE), r);
});

test('resizeCrop locked: the corner holds the ratio and the bounds', () => {
  const r = { x: 0.25, y: 0.25, w: 0.25, h: 0.5 };
  const big = resizeCrop(r, 'se', { x: 5, y: 5 }, SIZE, 1);
  const px = cropPixels(big, SIZE);
  assert.equal(px.w, px.h);
  assert.ok(big.x + big.w <= 1 + 1e-9 && big.y + big.h <= 1 + 1e-9);
  assert.equal(big.x, 0.25);
  const nw = resizeCrop(r, 'nw', { x: -5, y: -5 }, SIZE, 2);
  near((nw.w * SIZE.w) / (nw.h * SIZE.h), 2);
  assert.ok(nw.x >= 0 && nw.y >= 0);
  near(nw.x + nw.w, 0.5);
  assert.deepEqual(handlesFor(1), ['nw', 'ne', 'se', 'sw']);
  assert.equal(handlesFor(null).length, 8);
});

test('rotateLeft turns the size, the crop and the strokes', () => {
  assert.deepEqual(turnedSize(SIZE, 1), { w: 200, h: 400 });
  assert.deepEqual(turnedSize(SIZE, 2), SIZE);
  let edit = setCrop(initialEdit(), { x: 0, y: 0, w: 0.5, h: 1 });
  edit = addStroke(edit, {
    ...newStroke('brush', '#f00', 0.01, { x: 1, y: 0 }),
  });
  const turned = rotateLeft(edit);
  assert.equal(turned.turns, 1);
  // The left half of a landscape picture is the bottom half once turned.
  assert.deepEqual(turned.crop, { x: 0, y: 0.5, w: 1, h: 0.5 });
  // The top right corner goes to the top left.
  assert.deepEqual(turned.strokes[0].points[0], [0, 0]);
  let four = edit;
  for (let i = 0; i < 4; i += 1) {
    four = rotateLeft(four);
  }
  assert.deepEqual(four, edit);
});

test('flipHorizontal mirrors the crop and the strokes; twice is nothing', () => {
  let edit = setCrop(initialEdit(), { x: 0.125, y: 0.25, w: 0.25, h: 0.5 });
  edit = addStroke(
    edit,
    newStroke('marker', '#0f0', 0.02, { x: 0.25, y: 0.5 })
  );
  const flipped = flipHorizontal(edit);
  assert.equal(flipped.flip, true);
  near(flipped.crop.x, 0.625);
  near(flipped.strokes[0].points[0][0], 0.75);
  assert.deepEqual(flipHorizontal(flipped), edit);
  // Turning a mirrored picture goes the other way round in the file.
  assert.equal(rotateLeft(flipped).turns, 3);
  assert.equal(rotateLeft(rotateLeft(flipped)).turns, 2);
});

test('isEdited sees any change', () => {
  assert.equal(isEdited(initialEdit()), false);
  assert.equal(isEdited(rotateLeft(initialEdit())), true);
  assert.equal(isEdited(flipHorizontal(initialEdit())), true);
  assert.equal(
    isEdited(setCrop(initialEdit(), { x: 0, y: 0, w: 1, h: 0.9 })),
    true
  );
});

test('strokes: points clamp, arrows keep two ends, no repeats', () => {
  const brush = newStroke('brush', '#fff', 0.01, { x: -1, y: 2 });
  assert.deepEqual(brush.points, [[0, 1]]);
  const more = extendStroke(brush, { x: 0.5, y: 0.5 });
  assert.equal(more.points.length, 2);
  assert.equal(extendStroke(more, { x: 0.5, y: 0.5 }), more);
  const arrow = newStroke('arrow', '#fff', 0.01, { x: 0, y: 0 });
  assert.equal(isMark(arrow), false);
  const drawn = extendStroke(extendStroke(arrow, { x: 0.3, y: 0.3 }), {
    x: 0.9,
    y: 0.1,
  });
  assert.deepEqual(drawn.points, [
    [0, 0],
    [0.9, 0.1],
  ]);
  assert.equal(isMark(drawn), true);
  assert.equal(
    newStroke('brush', '#fff', 0.01, { x: NaN, y: 0 }).points[0][0],
    0
  );
});

test('arrowHead: two barbs behind the tip at the given length', () => {
  const [a, b] = arrowHead({ x: 0, y: 0 }, { x: 10, y: 0 }, 4);
  near(Math.hypot(a.x - 10, a.y), 4);
  assert.ok(a.x < 10 && b.x < 10);
  near(a.y, -b.y);
});

test('the undo stack: push, undo, redo, a new edit drops the redo', () => {
  const a = initialEdit();
  const b = rotateLeft(a);
  const c = flipHorizontal(b);
  let h = startHistory(a);
  assert.equal(canUndo(h), false);
  assert.equal(undoHistory(h), h);
  assert.equal(redoHistory(h), h);
  h = pushHistory(pushHistory(h, b), c);
  assert.equal(h.present, c);
  h = undoHistory(h);
  assert.equal(h.present, b);
  assert.equal(canRedo(h), true);
  h = undoHistory(h);
  assert.equal(h.present, a);
  h = redoHistory(h);
  assert.equal(h.present, b);
  h = pushHistory(h, a);
  assert.equal(canRedo(h), false);
  assert.deepEqual(h.past, [a, b]);
});

test('output: JPEG stays JPEG, the rest is PNG, extensions follow', () => {
  assert.equal(outputType('image/jpeg'), 'image/jpeg');
  assert.equal(outputType('image/jpg'), 'image/jpeg');
  assert.equal(outputType('image/webp'), 'image/png');
  assert.equal(outputName('a.jpg', 'image/jpeg'), 'a.jpg');
  assert.equal(outputName('a.JPEG', 'image/jpeg'), 'a.JPEG');
  assert.equal(outputName('a.png', 'image/png'), 'a.png');
  assert.equal(outputName('shot.webp', 'image/png'), 'shot.png');
  assert.equal(outputName('noext', 'image/jpeg'), 'noext.jpg');
  assert.equal(isEditable('image/png'), true);
  assert.equal(isEditable('image/gif'), false);
  assert.equal(isEditable('image/heic'), false);
});
