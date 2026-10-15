// How the tutorial card follows its target: placed once, in the frame
// the target scrolls in, so a scroll never moves it on its own.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { choosePlacement, MARGIN } from '../src/web/tutorial-placement.js';
import {
  followLayout,
  isTall,
  pageRectOf,
  screenRectOf,
  targetFrame,
} from '../src/web/tutorial-follow.js';

const card = { width: 368, height: 290 };
const desktop = { width: 1280, height: 800 };

const layoutFor = (target, frame = 'page', origin) =>
  followLayout({
    placement: choosePlacement({ target, card, viewport: desktop }),
    frame,
    target,
    card,
    viewport: desktop,
    origin,
  });

test('a target in a fixed or sticky bar keeps a fixed card', () => {
  const sticky = { nodeType: 1, parentElement: null };
  const item = { nodeType: 1, parentElement: sticky };
  const view = {
    getComputedStyle: (node) => ({
      position: node === sticky ? 'sticky' : 'static',
    }),
  };
  assert.equal(targetFrame(item, view), 'fixed');
  const plain = { nodeType: 1, parentElement: { nodeType: 1 } };
  assert.equal(
    targetFrame(plain, { getComputedStyle: () => ({ position: 'static' }) }),
    'page'
  );
});

test('beside a page target the card is in document coordinates', () => {
  const target = { top: 300, left: 400, width: 500, height: 120 };
  const layout = layoutFor(target, 'page', { top: -250, left: 0 });
  assert.equal(layout.mode, 'page');
  assert.equal(layout.style.position, 'absolute');
  // Relative to the overlay, which has scrolled 250px up with the page.
  assert.equal(parseFloat(layout.style.top), layout.top + 250);
});

test('a card for a target in the navigation is fixed to the screen', () => {
  const target = { top: 200, left: 12, width: 200, height: 40 };
  const layout = layoutFor(target, 'fixed');
  assert.equal(layout.mode, 'fixed');
  assert.equal(layout.style.position, 'fixed');
  assert.equal(layout.side, 'right');
});

test('beside a section taller than the screen the card is pinned mid-screen', () => {
  const target = { top: 80, left: 560, width: 700, height: 2400 };
  assert.ok(isTall(target, desktop));
  const layout = layoutFor(target);
  assert.equal(layout.side, 'left');
  assert.equal(layout.mode, 'pinned');
  assert.equal(layout.top, (desktop.height - card.height) / 2);
  assert.equal(layout.arrow, card.height / 2);
  // Wherever the section has scrolled to, the card is in the same place.
  const scrolled = layoutFor({ ...target, top: -900 });
  assert.deepEqual(scrolled.style, layout.style);
});

test('a docked or centred card is pinned to the screen', () => {
  const wide = { top: 60, left: 20, width: 1240, height: 2000 };
  const docked = layoutFor(wide);
  assert.equal(docked.side, 'dock');
  assert.equal(docked.mode, 'pinned');
  assert.equal(docked.style.position, 'fixed');
  assert.ok(docked.top >= MARGIN);
});

test('page and screen rects convert both ways', () => {
  const rect = { top: 10, left: 5, width: 100, height: 50 };
  const scroll = { x: 0, y: 400 };
  const page = pageRectOf(rect, scroll);
  assert.deepEqual(page, { top: 410, left: 5, width: 100, height: 50 });
  assert.deepEqual(screenRectOf(page, scroll), rect);
});
