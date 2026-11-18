import { modelFingerprint } from '../automation/answer-model-context.js';
import {
  cvTranslationOptions,
  confirmedCvTranslation,
} from '../jobs/cv-translation-record.js';

const stores = new WeakMap();
const prefix = 'secret:cv-experience-translation:';
const privateKey = (id) => {
  if (typeof id !== 'string' || !id.startsWith('jobs-cv-translation')) {
    throw new Error('Invalid private translation key.');
  }
  return prefix + id;
};
/** Reuse the translator without exposing experience text to ordinary peer sync. */
export const privateExperienceTranslations = (store) => {
  if (!stores.has(store)) {
    stores.set(store, {
      get: async (id) => {
        const row = await store.get(privateKey(id));
        return row ? { ...row, id } : null;
      },
      put: async (row) => store.put({ ...row, id: privateKey(row.id) }),
      delete: (id) => store.delete(privateKey(id)),
      flush: () => store.flush?.(),
    });
  }
  return stores.get(store);
};

/** Input bounds are the existing translator's bounds, including encoded byte size. */
export const experienceTranslationBatches = async (options, texts) => {
  const batches = [];
  let next = [];
  const make = async (values, index) =>
    cvTranslationOptions({
      requestId: `xp-${await modelFingerprint([options.requestId, index])}`,
      browserSlot: 'cv-experience-translation',
      from: options.toLanguage === 'en' ? 'ru' : 'en',
      to: options.toLanguage,
      texts: values,
      models: options.models,
    });
  for (const value of texts) {
    try {
      await make([...next, value], batches.length);
    } catch {
      if (!next.length) {
        throw new Error('Experience text exceeds translation bounds.');
      }
      batches.push(await make(next, batches.length));
      next = [];
    }
    next.push(value);
  }
  if (next.length) {
    batches.push(await make(next, batches.length));
  }
  return batches;
};

export const checkedExperienceTranslations = async (
  values,
  batches,
  completed = false
) => {
  if (
    !Array.isArray(values) ||
    values.length > batches.length ||
    (completed &&
      (values.length !== batches.length ||
        values.some((row) => row.state !== 'completed')))
  ) {
    throw new Error('Experience translations were not confirmed.');
  }
  for (const [index, comparison] of values.entries()) {
    await confirmedCvTranslation({ comparison });
    if (
      (await modelFingerprint(comparison.input)) !==
      (await modelFingerprint(batches[index]))
    ) {
      throw new Error('Experience translation fields did not match.');
    }
  }
  return values;
};
