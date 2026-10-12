// Tutorial card placement: beside the target, inside the viewport,
// never covering the control the step asks the user to click.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  GAP,
  MARGIN,
  anchoredCardStyle,
  choosePlacement,
  intersects,
} from '../src/web/tutorial-placement.js';
import {
  defaultSteps,
  navigationFor,
  placeMatches,
} from '../src/web/tutorial.js';

const card = { width: 368, height: 290 };
const desktop = { width: 1440, height: 900 };
const phone = { width: 390, height: 844 };

const boxOf = (placement, size = card) => ({
  top: placement.top,
  left: placement.left,
  width: size.width,
  height: size.height,
});

const inside = (box, viewport) =>
  box.left >= 0 &&
  box.top >= 0 &&
  box.left + box.width <= viewport.width &&
  box.top + box.height <= viewport.height;

test('a nav item in the left drawer gets the card on its right', () => {
  const target = { top: 560, left: 8, width: 215, height: 36 };
  const p = choosePlacement({ target, card, viewport: desktop });
  assert.equal(p.side, 'right');
  assert.equal(p.left, target.left + target.width + GAP);
  assert.ok(!intersects(boxOf(p), target));
  assert.ok(inside(boxOf(p), desktop));
  // Vertically centred on the target, arrow at the target's centre.
  assert.equal(p.top + p.arrow, target.top + target.height / 2);
});

test('the card shifts to stay on screen and the arrow keeps pointing', () => {
  // Last nav item, near the bottom edge.
  const target = { top: 850, left: 8, width: 215, height: 36 };
  const p = choosePlacement({ target, card, viewport: desktop });
  assert.equal(p.side, 'right');
  assert.equal(p.top, desktop.height - MARGIN - card.height);
  assert.ok(inside(boxOf(p), desktop));
  assert.equal(p.top + p.arrow, target.top + target.height / 2);
});

test('a wide target (a card or panel) prefers below, then above', () => {
  const below = choosePlacement({
    target: { top: 140, left: 540, width: 700, height: 180 },
    card,
    viewport: desktop,
  });
  assert.equal(below.side, 'bottom');
  const panel = { top: 500, left: 540, width: 1030, height: 130 };
  const above = choosePlacement({
    target: { ...panel, top: 560 },
    card,
    viewport: desktop,
  });
  assert.equal(above.side, 'top');
  assert.ok(!intersects(boxOf(above), { ...panel, top: 560 }));
});

test('phone bottom-nav item: the card sits above it, full width', () => {
  const phoneCard = { width: 366, height: 290 };
  const target = { top: 784, left: 234, width: 78, height: 56 };
  const p = choosePlacement({ target, card: phoneCard, viewport: phone });
  assert.equal(p.side, 'top');
  assert.ok(!intersects(boxOf(p, phoneCard), target));
  assert.ok(inside(boxOf(p, phoneCard), phone));
  assert.equal(p.left + p.arrow, target.left + target.width / 2);
});

test('without room on any side the card docks away from the target', () => {
  const huge = { top: 100, left: 10, width: 370, height: 600 };
  const p = choosePlacement({ target: huge, card, viewport: phone });
  assert.equal(p.side, 'dock');
  assert.ok(inside(boxOf(p), { width: phone.width + 1, height: phone.height }));
});

test('no target means a centred card without an arrow', () => {
  const p = choosePlacement({ target: null, card, viewport: desktop });
  assert.equal(p.side, 'center');
  assert.equal(p.arrow, null);
  assert.equal(p.left, (desktop.width - card.width) / 2);
});

test('anchored styles attach the card to the anchor on the chosen side', () => {
  const right = anchoredCardStyle('right', card);
  assert.match(right.left, /anchor\(--tutorial-target right\)/);
  assert.match(right.top, /clamp\(/);
  const top = anchoredCardStyle('top', card);
  assert.match(top.bottom, /anchor\(--tutorial-target top\)/);
  assert.equal(anchoredCardStyle('center', card), null);
});

test('steps that describe a click advance on it; Next performs it', () => {
  const byId = Object.fromEntries(defaultSteps.map((s) => [s.id, s]));
  assert.deepEqual(
    defaultSteps.map((s) => s.id),
    [
      'connect',
      'signIns',
      'pick',
      'setup',
      'chat',
      'contacts',
      'automation',
      'backup',
    ]
  );
  assert.equal(byId.connect.action, true);
  assert.match(byId.connect.advanceOn, /nav:connections/);
  assert.equal(byId.pick.action, true);
  // "Pick" ends when a provider page opens, whichever button did it.
  assert.deepEqual(byId.pick.completeAt, { view: 'connections', detail: true });
  assert.deepEqual(byId.pick.route, { view: 'connections', detail: false });
  assert.deepEqual(byId.setup.route, { view: 'connections', detail: true });
  // The biggest service, first in the list, is the suggested one.
  assert.match(byId.pick.actionTarget, /connections:email/);
  // Browser sign-ins need the local server; without it the step is
  // passed over instead of showing a card about nothing.
  assert.equal(byId.signIns.optional, true);
  assert.equal(byId.signIns.action, undefined);
  assert.equal(byId.setup.tutorialId, 'auto-import');
  // Sections hidden in the phone's More sheet point at "More".
  assert.deepEqual(byId.backup.fallbacks, ['nav:more']);
});

test('steps know their page and how to get there', () => {
  const list = { view: 'connections', detail: false };
  const detail = { view: 'connections', detail: true };
  const chat = { view: 'chat', provider: null };
  const stale = { view: 'chat', provider: 'telegram' };
  const onList = { view: 'connections', provider: null };
  const onEmail = { view: 'connections', provider: 'email' };
  assert.ok(placeMatches(undefined, chat), 'nav steps work anywhere');
  assert.ok(!placeMatches(list, chat));
  assert.ok(placeMatches(list, onList));
  assert.ok(!placeMatches(list, onEmail));
  assert.ok(placeMatches(detail, onEmail));
  // To the list: clear a provider hash, even a stale one.
  assert.deepEqual(navigationFor(list, stale), {
    view: 'connections',
    anchor: '',
  });
  // To a provider page: keep the one in the hash, else Email.
  assert.deepEqual(navigationFor(detail, stale), { view: 'connections' });
  assert.deepEqual(navigationFor(detail, chat), {
    view: 'connections',
    anchor: '#conn-email',
  });
});
