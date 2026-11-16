import { modelFingerprint } from '../automation/answer-model-context.js';
import { createCvTranslationService } from '../jobs/cv-translation-service.js';
import { createCvTranslationAdapters } from '../jobs/cv-translation-adapters.js';
import { storedExperienceDocument } from './experience-store.js';
import { PrivateCvJob } from './private-job.js';
import {
  createExperiencePlan,
  experienceTranslationTexts,
  applyExperienceTranslations,
} from './experience-plan.js';
import {
  privateExperienceTranslations,
  experienceTranslationBatches,
  checkedExperienceTranslations,
} from './experience-plan-translation.js';
import {
  experiencePlanFailure,
  experiencePlanKey,
  experiencePlanOptions,
  experiencePlanRunning,
  newExperiencePlan,
  checkedExperiencePlanRecord,
  experiencePlanPhase,
} from './experience-plan-record.js';

const owners = new WeakMap();

const template = async (store, options) => {
  const hh = await storedExperienceDocument(store, options.hh);
  const linkedin = await storedExperienceDocument(store, options.linkedin);
  const plan = createExperiencePlan(hh.document, linkedin.document, options);
  const batches = await experienceTranslationBatches(
    { ...options, toLanguage: plan.target.language },
    experienceTranslationTexts(plan)
  );
  return { plan, batches };
};
const checked = (store) => async (value, id) => {
  const row = checkedExperiencePlanRecord(value, id);
  if (row.options) {
    const { batches } = await template(store, row.options);
    await checkedExperienceTranslations(
      row.comparisons,
      batches,
      row.phase === 'completed'
    );
  }
  return row;
};

const translateBatch = async (translator, input, owned, save) => {
  try {
    return await translator['cv-translate'](input);
  } catch (error) {
    // Status only: retain any already-produced variants without retrying a provider.
    const result = await translator['cv-translation-status'](input);
    if (result.comparison) {
      await save({
        comparisons: [...owned.row.comparisons, result.comparison],
      });
    }
    throw error;
  }
};

export const experiencePlanView = (store) => async (row, active) => {
  const phase = experiencePlanPhase(row, active);
  const { id: _id, version: _version, comparisons, ...header } = row;
  let plan = null;
  if (row.options) {
    const data = await template(store, row.options);
    await checkedExperienceTranslations(comparisons, data.batches);
    plan = applyExperienceTranslations(data.plan, comparisons);
  }
  const content = {
    ...header,
    phase,
    requiresReview: true,
    providerSaved: false,
    plan,
    ...(phase === 'unknown'
      ? {
          code: 'cv-experience-plan-ownership-unverified',
          lastPhase: row.phase,
        }
      : {}),
    ...(phase === 'interrupted'
      ? { code: 'cv-experience-plan-interrupted' }
      : {}),
  };
  return { ...content, fingerprint: await modelFingerprint(content) };
};
const workFor = (store, adapters) => async (owned, save) => {
  const signal = owned.controller.signal;
  try {
    signal.throwIfAborted();
    const { batches } = await template(store, owned.row.options);
    const live = adapters ?? createCvTranslationAdapters();
    const descriptors = new Map();
    const translator = createCvTranslationService({
      store: privateExperienceTranslations(store),
      adapters: {
        ...live,
        resolve: (provider, models, signal) => {
          if (!descriptors.has(provider)) {
            descriptors.set(
              provider,
              Promise.resolve().then(() =>
                live.resolve(provider, models, signal)
              )
            );
          }
          return descriptors.get(provider);
        },
      },
      run: (operation) => operation(signal),
    });
    for (const input of batches) {
      signal.throwIfAborted();
      await save({ phase: 'translating' });
      if (process.env.MS_CV_PLAN_DEBUG === '1') {
        console.error(
          `[cv-experience-plan] translating batch ${owned.row.comparisons.length + 1}/${batches.length}`
        );
      }
      const result = await translateBatch(translator, input, owned, save);
      signal.throwIfAborted();
      await save({
        comparisons: [...owned.row.comparisons, result.comparison],
      });
    }
    signal.throwIfAborted();
    await save({ phase: 'completed' });
  } catch {
    await save({
      phase: signal.aborted ? 'stopped' : 'failed',
      code: signal.aborted ? null : 'cv-experience-plan-unavailable',
    });
  }
};

export const createExperiencePlanningService = ({ store, adapters }) => {
  if (owners.has(store)) {
    return owners.get(store);
  }
  const service = new PrivateCvJob({
    store,
    key: experiencePlanKey,
    optionsFor: async (input) => {
      const options = experiencePlanOptions(input);
      await template(store, options);
      return options;
    },
    newRecord: newExperiencePlan,
    checked: checked(store),
    view: experiencePlanView(store),
    failure: experiencePlanFailure,
    work: workFor(store, adapters),
  });
  const controls = service.controls();
  owners.set(store, controls);
  return controls;
};

export const readExperiencePlan = async (store, { requestId }) =>
  experiencePlanView(store)(
    await checked(store)(
      await store.get(experiencePlanKey(requestId)),
      requestId
    ),
    null
  );
export { experiencePlanRunning };
