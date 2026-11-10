// Bounded schema probe: no connection, credentials or reference code execution.
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const { Api, LAYER } = createRequire(import.meta.url)('teleproto/tl');
const set = new Api.StickerSet({
  id: 1n,
  accessHash: 2n,
  title: 'Fixture masks',
  shortName: 'Fixture_masks',
  count: 1,
  hash: 3,
  masks: true,
});
const answer = new Api.messages.AllStickers({ hash: 0n, sets: [set] });
assert.equal(answer.sets.length, 1);
assert.equal(answer.stickers, undefined);
assert.equal((answer.stickers ?? []).length, 0);
console.log(
  JSON.stringify(
    {
      layer: LAYER,
      constructor: answer.className,
      setCount: answer.sets.length,
      legacyDocumentCount: (answer.stickers ?? []).length,
      requiredNextStep: 'messages.GetStickerSet for each returned mask set',
    },
    null,
    2
  )
);
