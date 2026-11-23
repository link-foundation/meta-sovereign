import { modelFingerprint } from '../automation/answer-model-context.js';
import { saveAcknowledgedRecord } from '../storage/acknowledged-record.js';
import { copyExperienceData } from './experience.js';
import {
  draftLinkedinPosition,
  linkedinPositionFailure,
  linkedinPositionFingerprint,
} from './linkedin-position-plan.js';

const lanes = new WeakMap();
const key = (fingerprint) =>
  `secret:cv-linkedin-position:${linkedinPositionFingerprint(fingerprint)}`;
const serial = (store, run) => {
  const task = (lanes.get(store) ?? Promise.resolve())
    .catch(() => {})
    .then(run);
  lanes.set(store, task);
  return task.finally(() => {
    if (lanes.get(store) === task) {
      lanes.delete(store);
    }
  });
};

const checked = async (row, id) => {
  if (!row?.plan || row.id !== id || row.version !== 1) {
    throw linkedinPositionFailure('record');
  }
  const { fingerprint, ...content } = row.plan;
  if (
    id !== key(fingerprint) ||
    !['draft', 'reviewed'].includes(content.phase) ||
    content.providerSaved !== false ||
    content.browserSlot !== 'linkedin-experience' ||
    (await modelFingerprint(content)) !== fingerprint
  ) {
    throw linkedinPositionFailure('record');
  }
  return copyExperienceData(row.plan);
};

const stored = async (store, fingerprint) => {
  const id = key(fingerprint);
  return checked(await store.get(id), id);
};
const save = async (store, plan) => {
  const id = key(plan.fingerprint);
  const prior = await store.get(id);
  if (prior) {
    return checked(prior, id);
  }
  const row = { id, version: 1, plan };
  const admitted = await checked(row, id);
  await saveAcknowledgedRecord(store, row);
  return admitted;
};

/** A provider editor may open only for a separately acknowledged review. */
export const createLinkedinPositionReviews = (context) => {
  const { store } = context;
  return {
    stage: (input) =>
      serial(store, async () =>
        save(store, await draftLinkedinPosition(context, input))
      ),
    stored: async ({ fingerprint }) => {
      await lanes.get(store)?.catch(() => {});
      return stored(store, fingerprint);
    },
    review: ({ fingerprint }) =>
      serial(store, async () => {
        const draft = await stored(store, fingerprint);
        if (draft.phase !== 'draft') {
          throw linkedinPositionFailure('review');
        }
        const fresh = await draftLinkedinPosition(context, draft.experience);
        if (fresh.fingerprint !== fingerprint) {
          throw linkedinPositionFailure('conflict');
        }
        const { fingerprint: draftFingerprint, ...plan } = fresh;
        const reviewed = { ...plan, phase: 'reviewed', draftFingerprint };
        return save(store, {
          ...reviewed,
          fingerprint: await modelFingerprint(reviewed),
        });
      }),
  };
};

export const authorizedLinkedinPosition = async (context, fingerprint) => {
  const service = createLinkedinPositionReviews(context);
  const reviewed = await service.stored({ fingerprint });
  if (reviewed.phase !== 'reviewed') {
    throw linkedinPositionFailure('review');
  }
  const fresh = await draftLinkedinPosition(context, reviewed.experience);
  if (fresh.fingerprint !== reviewed.draftFingerprint) {
    throw linkedinPositionFailure('conflict');
  }
  const { fingerprint: draftFingerprint, ...plan } = fresh;
  const expected = { ...plan, phase: 'reviewed', draftFingerprint };
  if ((await modelFingerprint(expected)) !== fingerprint) {
    throw linkedinPositionFailure('conflict');
  }
  return reviewed;
};
