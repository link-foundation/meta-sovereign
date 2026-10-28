// Reproduce the React warning observed in all CI runtimes without a browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MediaSticker } from '../src/web/chat-media.js';

test('still and video sticker children render without React key warnings', (t) => {
  const errors = [];
  const originalError = console.error;
  console.error = (...args) => errors.push(args.join(' '));
  t.after(() => {
    console.error = originalError;
  });
  for (const stickerFormat of ['webp', 'webm']) {
    const html = renderToStaticMarkup(
      React.createElement(MediaSticker, {
        media: { stickerFormat, emoji: '🙂' },
        api: {},
        chat: 'fixture',
        msgId: '1',
      })
    );
    assert.match(html, /bubble-sticker/);
  }
  assert.deepEqual(errors, []);
});
