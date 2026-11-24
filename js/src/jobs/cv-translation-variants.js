import { modelFingerprint } from '../automation/answer-model-context.js';
import { saveTechnologyRecord } from './technology-storage.js';
import {
  cvTranslationModelId,
  cvTranslationVerdict,
  cvTranslationFailure as failure,
} from './cv-translation-record.js';

export const cvTranslationPlaceholder = (provider, reason = 'pending') => ({
  provider,
  model: null,
  output: null,
  text: null,
  reason,
  cached: false,
});
const errorReason = (error) =>
  /^jobs-cv-translation-[a-z-]{1,40}$/u.test(error.code ?? '')
    ? error.code.slice('jobs-cv-translation-'.length)
    : 'unavailable';

const validResult = (provider, descriptor, result, length) =>
  result &&
  cvTranslationModelId(provider, result.model) &&
  Array.isArray(result.outputs) &&
  result.outputs.length === length &&
  result.outputs.every(
    (output) => typeof output === 'string' && output.length <= 12000
  ) &&
  (!descriptor.cacheable || result.model === descriptor.model);

export const createCvTranslationVariants =
  ({ store, adapters }) =>
  async (options, rows, provider, signal) => {
    const position = options.providers.indexOf(provider);
    let descriptor;
    const results = new Map();
    try {
      descriptor = await adapters.resolve(provider, options.models, signal);
      if (
        !descriptor ||
        !cvTranslationModelId(provider, descriptor.model, true) ||
        typeof descriptor.cacheable !== 'boolean'
      ) {
        throw failure('model');
      }
      const unique = [...new Set(options.texts)];
      const missing = [];
      for (const source of unique) {
        const identity = {
          version: 1,
          provider,
          model: descriptor.model,
          from: options.from,
          to: options.to,
          source,
        };
        const key = `jobs-cv-translation-cache:${await modelFingerprint(identity)}`;
        const cached = descriptor.cacheable ? await store.get(key) : null;
        if (cached) {
          const verdict = cvTranslationVerdict(
            source,
            cached.output,
            options.to
          );
          if (
            (await modelFingerprint(cached.identity)) !==
              (await modelFingerprint(identity)) ||
            !verdict.text
          ) {
            throw failure('cache');
          }
          results.set(source, {
            provider,
            model: descriptor.model,
            output: cached.output,
            ...verdict,
            cached: true,
          });
        } else {
          missing.push({ source, key, identity });
        }
      }
      // Sequential bounded batches retain each provider's complete comparison.
      for (let offset = 0; offset < missing.length; offset += 5) {
        signal.throwIfAborted();
        const batch = missing.slice(offset, offset + 5);
        const result = await adapters.translate(
          provider,
          descriptor,
          {
            from: options.from,
            to: options.to,
            texts: batch.map((entry) => entry.source),
          },
          signal
        );
        if (!validResult(provider, descriptor, result, batch.length)) {
          throw failure('response');
        }
        signal.throwIfAborted();
        for (const [index, entry] of batch.entries()) {
          const output = result.outputs[index];
          const verdict = cvTranslationVerdict(
            entry.source,
            output,
            options.to
          );
          results.set(entry.source, {
            provider,
            model: result.model,
            output,
            ...verdict,
            cached: false,
          });
          if (verdict.text && descriptor.cacheable) {
            await saveTechnologyRecord(store, {
              id: entry.key,
              version: 1,
              identity: entry.identity,
              output,
            });
          }
        }
      }
      return rows.map((row) => ({
        ...row,
        variants: row.variants.map((variant, index) =>
          index === position ? results.get(row.source) : variant
        ),
      }));
    } catch (error) {
      signal.throwIfAborted();
      return rows.map((row) => ({
        ...row,
        variants: row.variants.map((variant, index) =>
          index === position
            ? (results.get(row.source) ?? {
                ...cvTranslationPlaceholder(provider, errorReason(error)),
                model: cvTranslationModelId(provider, descriptor?.model)
                  ? descriptor.model
                  : null,
              })
            : variant
        ),
      }));
    }
  };
