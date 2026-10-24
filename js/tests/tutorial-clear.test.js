// The tutorial card stays clear of its target (R-Z22): where the card
// leaves room, and when a target counts as placed clear of it.

import test from 'node:test';
import assert from 'node:assert/strict';
import { freeBand, placedClear } from '../src/web/tutorial-clear.js';

const viewport = { width: 1280, height: 560 };
const card = { top: 277, left: 456, width: 368, height: 271 };

test('a card in the lower half leaves the band above it', () => {
  const band = freeBand(card, viewport, 56);
  assert.deepEqual(band, { top: 56, bottom: 265, below: true });
});

test('a card in the upper half leaves the band below it', () => {
  const band = freeBand({ ...card, top: 12 }, viewport, 56);
  assert.equal(band.top, 12 + 271 + 12);
  assert.equal(band.bottom, 560);
  assert.equal(band.below, false);
});

test('a target that fits the band must not meet the card', () => {
  const band = freeBand(card, viewport, 56);
  const covered = { top: 72, left: 252, width: 1008, height: 248 };
  assert.equal(placedClear(covered, card, band, viewport), false);
  const clear = { ...covered, top: 10, height: 200 };
  assert.equal(placedClear(clear, card, band, viewport), true);
});

test('a target beside the card is clear whatever its size', () => {
  const band = freeBand(card, viewport, 56);
  const beside = { top: 56, left: 8, width: 200, height: 2000 };
  assert.equal(placedClear(beside, card, band, viewport), true);
});

test('a target taller than the screen is read from its top', () => {
  const band = freeBand(card, viewport, 56);
  const tall = { top: 60, left: 252, width: 1008, height: 2400 };
  assert.equal(placedClear(tall, card, band, viewport), true);
  const scrolled = { ...tall, top: -400 };
  assert.equal(placedClear(scrolled, card, band, viewport), false);
});
