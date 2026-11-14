import { createMemoryStore } from '../../src/storage/universal.js';
import { createStickers } from '../../src/sources/telegram-stickers.js';
import { createGreetingStickers } from '../../src/sources/telegram-greeting-stickers.js';
import { named } from './telegram-route.js';
import { messageAck } from './telegram-message-ack.mjs';

export const greetingDocument = (id, alt = '👋', ref = 1) => ({
  className: 'Document',
  id: BigInt(id),
  accessHash: BigInt(id * 10),
  fileReference: Buffer.from([ref]),
  mimeType: 'image/webp',
  size: 100,
  dcId: 2,
  attributes: [{ className: 'DocumentAttributeSticker', alt }],
});
export const greetingSet = (id) => ({
  id: BigInt(id),
  accessHash: BigInt(id * 10),
  shortName: `Set_${id}`,
});
export const greetingStickerFixture = ({
  store = createMemoryStore(),
  invoke,
  now = () => 1_000_000,
} = {}) => {
  const calls = [];
  let owner = '1';
  const Api = {
    InputStickerSetID: named('InputStickerSetID'),
    InputStickerSetShortName: named('InputStickerSetShortName'),
    InputMediaDocument: named('InputMediaDocument'),
    InputDocument: named('InputDocument'),
    messages: Object.fromEntries(
      [
        'GetOldFeaturedStickers',
        'GetMaskStickers',
        'GetRecentStickers',
        'GetFavedStickers',
        'GetStickerSet',
        'SendMedia',
      ].map((name) => [name, named(name)])
    ),
  };
  const helpers = {
    returnBigInt: (value) => BigInt(value),
    readBigIntFromBuffer: (buffer) => buffer.readBigInt64LE(0),
  };
  const client = {
    getMe: async () => ({ className: 'User', id: BigInt(owner) }),
    invoke: async (request) => {
      calls.push(request);
      if (invoke) {
        return invoke(request);
      }
      if (request.className === 'GetOldFeaturedStickers') {
        return { sets: [{ set: greetingSet(11) }] };
      }
      if (request.className === 'GetMaskStickers') {
        return { sets: [greetingSet(22)] };
      }
      if (request.className === 'GetStickerSet') {
        return { documents: [greetingDocument(Number(request.stickerset.id))] };
      }
      if (request.className === 'SendMedia') {
        return messageAck(request);
      }
      return {
        stickers: [
          greetingDocument(request.className === 'GetRecentStickers' ? 33 : 44),
        ],
      };
    },
  };
  const env = {
    store,
    importer: async () => ({ Api, helpers }),
    connection: {
      withPeer: async (_client, chat, use) => use({ userId: BigInt(chat) }),
    },
  };
  const context = { userClient: async () => client, apply: async () => {} };
  const { stickerLists, sendDocument } = createStickers(env, context, { now });
  const catalog = createGreetingStickers(
    env,
    { ...context, stickerLists },
    { now }
  );
  return {
    env,
    store,
    catalog,
    sendDocument,
    client,
    calls,
    c: { client, Api, helpers, zero: 0n },
    setOwner: (id) => {
      owner = id;
    },
  };
};
export const catalogFinished = async (catalog) => {
  for (let i = 0; i < 1000; i += 1) {
    const result = await catalog.greetingStickersStatus();
    if (!['running', 'cancelling'].includes(result.job?.state)) {
      return result;
    }
    await new Promise((resolve) => globalThis.setImmediate(resolve));
  }
  throw new Error('sticker refresh fixture did not finish');
};
export const refreshedCatalog = async (fixture, options = {}) => {
  const started = await fixture.catalog.greetingStickersRefresh(options);
  if (!started.ok) {
    throw new Error(started.code);
  }
  return catalogFinished(fixture.catalog);
};
