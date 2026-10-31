import { useEffect, useState } from 'react';
import { builtInGreetingStickers } from '../greetings/catalog.js';
import {
  categoryEmoji,
  collectionSticker,
  stickerIdentity,
} from '../greetings/collections.js';
import {
  chosenStickers,
  mergeCollectionItems as merge,
  restoreCollectionStickers,
} from './collection-model.js';
import { createRetryingRead } from './read-retry.js';

const useCatalogue = (api, setCollections, setError) => {
  const [pool, setPool] = useState(() =>
    Object.values(builtInGreetingStickers).flat()
  );
  const [sets, setSets] = useState([]);
  const addTelegram = (items, metadata = {}) =>
    setPool((current) => {
      const all = merge([
        ...current,
        ...items.map((item) => ({ ...item, network: 'telegram', ...metadata })),
      ]);
      return [
        ...all.filter((item) => item.network !== 'telegram'),
        ...all.filter((item) => item.network === 'telegram').slice(-2000),
      ];
    });
  useEffect(() => {
    const reader = createRetryingRead(
      async () => {
        const answer = await api.stickerCollections();
        if (!answer?.ok) {
          throw new Error('collections unavailable');
        }
        return answer.collections;
      },
      { accept: setCollections, failed: () => setError(true) }
    );
    reader.refresh();
    return () => reader.stop();
  }, [api]);
  useEffect(() => {
    let live = true;
    const reader = createRetryingRead(
      async () => {
        const status = await api.telegramStatus?.();
        if (!live || !status?.connected || status.kind !== 'user') {
          return;
        }
        const catalogue = await api.telegramStickers({});
        if (!catalogue?.ok) {
          throw new Error('catalogue unavailable');
        }
        if (!live) {
          return;
        }
        setSets(catalogue.sets);
        addTelegram([...catalogue.faved, ...catalogue.recent]);
        const found = await api.telegramStickerSearch({ q: '👋' });
        if (live && found?.ok) {
          addTelegram(found.stickers, { lookupQuery: '👋' });
        }
      },
      { accept: () => {}, failed: () => live && setError(true) }
    );
    reader.refresh();
    return () => {
      live = false;
      reader.stop();
    };
  }, [api]);
  return { pool, sets, setSets, addTelegram };
};
const useRestoredCollection = (api, current, catalogue, setError) => {
  useEffect(() => {
    if (current?.source !== 'telegram' || !catalogue.sets.length) {
      return undefined;
    }
    let live = true;
    restoreCollectionStickers(api, current)
      .then((items) => {
        if (live) {
          catalogue.addTelegram(items);
        }
      })
      .catch(() => live && setError(true));
    return () => {
      live = false;
    };
  }, [api, current?.id, catalogue.sets.length]);
};
export const useCollectionState = (api) => {
  const [collections, setCollections] = useState(null);
  const [selected, setSelected] = useState('');
  const [setId, setSetId] = useState('');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [visible, setVisible] = useState(80);
  const catalogue = useCatalogue(api, setCollections, setError);
  const current =
    collections?.find((row) => row.id === selected) ?? collections?.[0];
  useEffect(() => {
    setVisible(80);
  }, [current?.id]);
  useRestoredCollection(api, current, catalogue, setError);
  const run = async (task) => {
    setBusy(true);
    setError(false);
    try {
      await task();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };
  const changed = (next) => {
    setCollections(next);
    setDirty(true);
    setSaved(false);
  };
  const patch = (change) =>
    changed(
      collections.map((row) =>
        row.id === current.id ? { ...row, ...change } : row
      )
    );
  const chosen = current ? chosenStickers(current, catalogue.pool) : [];
  const checked = new Set(chosen.map(stickerIdentity));
  const offered = current
    ? merge([
        ...chosen,
        ...catalogue.pool.filter((item) => item.network === current.source),
      ])
    : [];
  const toggle = (item) =>
    patch({
      automatic: false,
      stickers: checked.has(stickerIdentity(item))
        ? chosen.filter((one) => stickerIdentity(one) !== stickerIdentity(item))
        : [...chosen, collectionSticker(item, current.source)].slice(0, 200),
    });
  const save = () =>
    run(async () => {
      const next = collections.map((row) => ({
        ...row,
        stickers: chosenStickers(row, catalogue.pool),
      }));
      const result = await api.saveStickerCollections(next);
      if (!result?.ok) {
        throw new Error('save failed');
      }
      setCollections(result.collections);
      setDirty(false);
      setSaved(true);
    });
  const lookup = () =>
    run(async () => {
      const q = query.trim() || categoryEmoji[current.category] || '';
      const result = await api.telegramStickerSearch({ q });
      if (!result?.ok) {
        throw new Error('lookup failed');
      }
      catalogue.addTelegram(result.stickers, { lookupQuery: q });
      catalogue.setSets((before) => [
        ...new Map(
          [...before, ...result.sets].map((item) => [item.id, item])
        ).values(),
      ]);
    });
  const loadPack = () =>
    run(async () => {
      const set = catalogue.sets.find((row) => row.id === setId);
      const result = await api.telegramStickerSet({ id: setId });
      if (!result?.ok) {
        throw new Error('set unavailable');
      }
      catalogue.addTelegram(result.stickers, { setId, pack: set.title });
    });
  const add = () => {
    const row = {
      id: `custom:${globalThis.crypto.randomUUID()}`,
      source: current?.source ?? 'telegram',
      category: 'custom',
      name: '',
      automatic: false,
      stickers: [],
    };
    changed([...collections, row]);
    setSelected(row.id);
  };
  return {
    api,
    collections,
    current,
    chosen,
    checked,
    offered,
    ...catalogue,
    setId,
    setSetId,
    query,
    setQuery,
    busy,
    error,
    saved,
    dirty,
    visible,
    setVisible,
    patch,
    toggle,
    save,
    lookup,
    loadPack,
    add,
    setSelected,
    remove: () => changed(collections.filter((row) => row.id !== current.id)),
  };
};
