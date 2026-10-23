// Animated stickers (R-Y113): a `.tgs` file (a gzipped Lottie
// animation) read back as its text, a plain one as it is, one too large
// refused.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';

import { lottieText } from '../src/web/lottie-sticker.js';

const ANIMATION = JSON.stringify({ v: '5.5.2', fr: 60, w: 512, h: 512 });

test('a .tgs file read back as its animation', async () => {
  const tgs = gzipSync(Buffer.from(ANIMATION));
  assert.equal(await lottieText(tgs), ANIMATION);
  assert.equal(await lottieText(Buffer.from(ANIMATION)), ANIMATION);
});

test('an animation too large is refused', async () => {
  const huge = gzipSync(Buffer.alloc(5 * 1024 * 1024, 32));
  await assert.rejects(lottieText(huge), /too large/);
});
