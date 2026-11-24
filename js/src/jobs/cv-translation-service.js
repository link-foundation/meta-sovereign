import {
  createCvTranslationVariants,
  cvTranslationPlaceholder,
} from './cv-translation-variants.js';
import { browserName } from '../browser/policy.js';
import { modelFingerprint } from '../automation/answer-model-context.js';
import { resumeExportRequestId } from './resume-export-options.js';
import { createCvTranslationAdapters } from './cv-translation-adapters.js';
import { saveTechnologyRecord } from './technology-storage.js';
import {
  cvTranslationOptions,
  cvTranslationFailure as failure,
  confirmedCvTranslation,
  fingerprintCvTranslation,
} from './cv-translation-record.js';

const requestKey = (id) => `jobs-cv-translation:${resumeExportRequestId(id)}`;
const latestKey = (slot) => `jobs-cv-translation-latest:${slot}`;
const lanes = new WeakMap();
const laneFor = (store) => {
  if (!lanes.has(store)) {
    lanes.set(store, { tail: Promise.resolve(), active: new Set() });
  }
  return lanes.get(store);
};
const admit = (lane, operation) => {
  const task = lane.tail.then(operation);
  lane.tail = task.catch(() => {});
  return task;
};
const choose = (rows) =>
  rows.map((row) => {
    const selected = row.variants.find((variant) => variant.text);
    return {
      ...row,
      chosen: selected?.text ?? null,
      chosenBy: selected?.provider ?? null,
    };
  });
const createCvTranslationStatus = (store, active) => async (input) => {
  const slot = browserName(input.browserSlot ?? 'jobs');
  const id = input.requestId ?? (await store.get(latestKey(slot)))?.requestId;
  if (!id) {
    return { comparison: null };
  }
  const row = await store.get(requestKey(id));
  if (!row) {
    return { comparison: null };
  }
  if (row.cancelled) {
    return confirmedCvTranslation(
      { comparison: null, cancelled: row.cancelled },
      {
        requestId: id,
        browserSlot: slot,
      }
    );
  }
  const result = await confirmedCvTranslation(
    { comparison: row.comparison },
    {
      requestId: id,
      browserSlot: slot,
    }
  );
  if (result.comparison.state === 'running' && !active.has(id)) {
    const { fingerprint: _old, ...content } = result.comparison;
    return {
      comparison: await fingerprintCvTranslation({
        ...content,
        state: 'interrupted',
      }),
    };
  }
  return result;
};

/** Finite, caller-owned comparisons. GET and repeated IDs never invoke a translator. */
export const createCvTranslationService = ({
  store,
  run,
  adapters = createCvTranslationAdapters(),
}) => {
  const lane = laneFor(store);
  const active = lane.active;
  const save = async (content) => {
    const comparison = await fingerprintCvTranslation(content);
    await confirmedCvTranslation({ comparison });
    await saveTechnologyRecord(store, {
      id: requestKey(content.input.requestId),
      version: 1,
      comparison,
    });
    return { comparison };
  };
  const status = createCvTranslationStatus(store, active);
  const variants = createCvTranslationVariants({ store, adapters });
  return {
    'cv-translation-status': status,
    'cv-translation-cancel': (input) =>
      admit(lane, async () => {
        const identity = {
          requestId: resumeExportRequestId(input.requestId),
          browserSlot: browserName(input.browserSlot ?? 'jobs'),
        };
        if (!(await store.get(requestKey(identity.requestId)))) {
          await saveTechnologyRecord(store, {
            id: requestKey(identity.requestId),
            version: 1,
            cancelled: identity,
          });
        }
        return status(identity);
      }),
    'cv-translate': async (input) => {
      const options = cvTranslationOptions(input);
      const previous = await status(options);
      if (previous.cancelled) {
        return previous;
      }
      if (previous.comparison) {
        if (
          (await modelFingerprint(previous.comparison.input)) !==
          (await modelFingerprint(options))
        ) {
          throw failure('conflict');
        }
        return previous;
      }
      return run(async (signal) => {
        // Recheck after entering the shared workspace owner.
        let content = {
          version: 1,
          input: options,
          state: 'running',
          requiresReview: true,
          providerSaved: false,
          createdAt: new Date().toISOString(),
          rows: choose(
            options.texts.map((source) => ({
              source,
              variants: options.providers.map((provider) =>
                cvTranslationPlaceholder(provider)
              ),
            }))
          ),
        };
        const existing = await admit(lane, async () => {
          const current = await status(options);
          if (current.comparison || current.cancelled) {
            return current;
          }
          active.add(options.requestId);
          try {
            await save(content);
            await saveTechnologyRecord(store, {
              id: latestKey(options.browserSlot),
              requestId: options.requestId,
            });
          } catch (error) {
            active.delete(options.requestId);
            throw error;
          }
          return null;
        });
        if (existing) {
          return existing;
        }
        try {
          for (const provider of options.providers) {
            signal.throwIfAborted();
            content = {
              ...content,
              rows: choose(
                await variants(options, content.rows, provider, signal)
              ),
            };
            await save(content);
          }
          signal.throwIfAborted();
          return await save({ ...content, state: 'completed' });
        } catch (error) {
          await save({
            ...content,
            state: signal.aborted ? 'stopped' : 'failed',
          });
          throw error;
        } finally {
          active.delete(options.requestId);
        }
      });
    },
  };
};
