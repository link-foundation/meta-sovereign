import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  Busy,
  ChatListSkeleton,
  PageLoading,
  Spinner,
} from '../src/web/spinner.js';

const el = React.createElement;
const render = (node) => renderToStaticMarkup(node);

test('loading is drawn as Telegram draws it (R-Y84)', () => {
  // The arc: hidden from screen readers unless it is all there is.
  const arc = render(el(Spinner));
  assert.match(arc, /class="spinner spinner-small"/);
  assert.match(arc, /aria-hidden="true"/);
  assert.match(arc, /<circle cx="12" cy="12" r="10">/);
  assert.match(
    render(el(Spinner, { size: 'large', label: 'Loading' })),
    /role="img" aria-label="Loading"/
  );
  // A page: the large arc, and words for screen readers.
  const page = render(el(PageLoading));
  assert.match(page, /class="page-loading" role="status"/);
  assert.match(page, /spinner-large/);
  assert.match(page, /class="sr-only">Loading…</);
  // A busy line: the arc before its words.
  const busy = render(el(Busy, { as: 'span' }, 'Updating…'));
  assert.match(
    busy,
    /^<span class="meta busy" role="status"><span class="spinner spinner-small"/
  );
  assert.match(busy, /class="busy-text">Updating…</);
  // The chat list before its rows.
  const rows = render(el(ChatListSkeleton, { rows: 3 }));
  assert.equal(rows.match(/chat-skeleton-row/g).length, 3);
  assert.match(rows, /aria-hidden="true"/);
});
