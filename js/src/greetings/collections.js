import { builtInGreetingStickers, greetingNetworks } from './catalog.js';
import { loadGreetingSelection, saveGreetingSelection } from './plan.js';

export const COLLECTIONS_ID = 'stickers:collections';
export const stickerSources = Object.keys(greetingNetworks).filter(
  (source) => greetingNetworks[source].sticker
);
export const collectionCategories = [
  'greeting',
  'birthday',
  'thanks',
  'farewell',
  'custom',
];
export const categoryEmoji = {
  greeting: '👋',
  birthday: '🎂',
  thanks: '🙏',
  farewell: '👋',
};
const rules = {
  greeting: /👋|🖐|🙋|привет|здравств|hello|greeting|你好|नमस्ते/iu,
  birthday: /🎂|🎁|🎉|birthday|дн[её]м рождения|生日|जन्मदिन/iu,
  thanks: /🙏|thank|спасибо|благодар|谢谢|धन्यवाद/iu,
  farewell: /farewell|goodbye|bye bye|пока|до свидания|再见|अलविदा/iu,
};
export const stickerIdentity = (item) => `${item.network}:${item.id}`;
export const matchesCollection = (item, category) =>
  Boolean(
    rules[category]?.test(
      [item.emoji, item.title, item.pack, item.keywords]
        .flat()
        .filter(Boolean)
        .join(' ')
    )
  );
const text = (value, max = 120) =>
  String(value ?? '')
    .trim()
    .slice(0, max);
const safeUrl = (value) => {
  try {
    return new URL(value).protocol === 'https:' ? text(value, 2048) : null;
  } catch {
    return null;
  }
};
export const collectionSticker = (input, source) => ({
  network: source,
  id: text(input.id, 100),
  kind: 'sticker',
  emoji: text(input.emoji, 30),
  format: text(input.format, 40),
  pack: text(input.pack ?? input.packTitle),
  previewUrl: safeUrl(input.previewUrl),
  url: safeUrl(input.url),
  setId: text(input.setId, 50),
  shortName: text(input.shortName, 64),
  setAccessHash: text(input.setAccessHash, 50),
  lookupQuery: text(input.lookupQuery, 100),
});
export const defaultStickerCollections = (selection = {}) =>
  stickerSources.map((source) => ({
    id: `${source}:greeting`,
    source,
    name: '',
    category: 'greeting',
    automatic: true,
    stickers: (selection.stickers ?? builtInGreetingStickers[source] ?? [])
      .filter((item) => item.network === source)
      .map((item) => collectionSticker(item, source)),
  }));
export const normalizeStickerCollections = (input) => {
  if (!Array.isArray(input) || input.length > 40) {
    throw new Error('at most 40 collections required');
  }
  const seen = new Set();
  return input.map((row) => {
    const id = text(row.id, 100);
    if (
      !id ||
      seen.has(id) ||
      !stickerSources.includes(row.source) ||
      !collectionCategories.includes(row.category)
    ) {
      throw new Error(
        'unique collection id, supported source and category required'
      );
    }
    seen.add(id);
    if (!Array.isArray(row.stickers) || row.stickers.length > 200) {
      throw new Error('at most 200 stickers per collection');
    }
    const stickers = new Map();
    for (const item of row.stickers) {
      if (
        !item ||
        (item.network && item.network !== row.source) ||
        !text(item.id, 100)
      ) {
        throw new Error('sticker source and id required');
      }
      const clean = collectionSticker(item, row.source);
      stickers.set(stickerIdentity(clean), clean);
    }
    return {
      id,
      source: row.source,
      category: row.category,
      name: text(row.name),
      automatic: row.automatic === true,
      stickers: [...stickers.values()],
    };
  });
};
export const loadStickerCollections = async (store) => {
  const saved = await store.get(COLLECTIONS_ID);
  return {
    ok: true,
    collections:
      saved?.collections ??
      defaultStickerCollections(
        (await store.get('greetings:selection'))?.selection
      ),
  };
};
export const saveStickerCollections = async (store, input) => {
  const collections = normalizeStickerCollections(input);
  await store.put({ id: COLLECTIONS_ID, collections });
  // User-session Telegram document IDs are not Bot API file IDs. Those
  // collections are used by the shared user-account sticker picker instead.
  const greeting = collections.filter(
    (row) => row.category === 'greeting' && row.source !== 'telegram'
  );
  if (greeting.length) {
    const sources = new Set(greeting.map((row) => row.source));
    const selection = await loadGreetingSelection(store);
    await saveGreetingSelection(store, {
      ...selection,
      stickers: [
        ...selection.stickers.filter((item) => !sources.has(item.network)),
        ...greeting.flatMap((row) => row.stickers),
      ],
    });
  }
  return { ok: true, collections };
};
