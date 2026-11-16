import { modelFingerprint } from '../automation/answer-model-context.js';
import { saveAcknowledgedRecord } from '../storage/acknowledged-record.js';
import {
  validateExperienceDocument,
  experienceDocumentFailure,
} from './experience-document.js';
import { copyExperienceData, compareExperience } from './experience.js';

const prefix = 'secret:cv-experience:';
const lanes = new WeakMap();
const fingerprint = (value) =>
  modelFingerprint(
    JSON.parse(
      JSON.stringify(value, (_key, item) =>
        item && typeof item === 'object' && !Array.isArray(item)
          ? Object.fromEntries(
              Object.entries(item).sort(([a], [b]) =>
                a < b ? -1 : a > b ? 1 : 0
              )
            )
          : item
      )
    )
  );
const serial = (store, operation) => {
  const task = (lanes.get(store) ?? Promise.resolve())
    .catch(() => {})
    .then(operation);
  lanes.set(store, task);
  return task.finally(() => {
    if (lanes.get(store) === task) {
      lanes.delete(store);
    }
  });
};
const checkedRow = async (row) => {
  row = copyExperienceData(row);
  if (
    !row ||
    row.version !== 1 ||
    !['imported', 'hh-export', 'linkedin-native'].includes(row.provenance?.kind)
  ) {
    throw experienceDocumentFailure();
  }
  const document = validateExperienceDocument(row.document);
  const revision = await fingerprint({ document, provenance: row.provenance });
  if (row.id !== `${prefix}${revision}` || row.revision !== revision) {
    throw experienceDocumentFailure();
  }
  return { revision, provenance: row.provenance, document };
};
/** Immutable private records; reads wait for a refused save to restore memory. */
export const saveExperienceDocument = (
  store,
  value,
  provenance = { kind: 'imported' }
) =>
  serial(store, async () => {
    const document = validateExperienceDocument(value);
    provenance = copyExperienceData(provenance);
    const revision = await fingerprint({ document, provenance });
    const row = {
      id: `${prefix}${revision}`,
      version: 1,
      revision,
      provenance,
      document,
    };
    await checkedRow(row);
    const old = await store.get(row.id);
    if (old) {
      return checkedRow(old);
    }
    await saveAcknowledgedRecord(store, row);
    return checkedRow(row);
  });
export const storedExperienceDocuments = async (store) => {
  await lanes.get(store)?.catch(() => {});
  let found = 0;
  const rows = await store.query(
    (row) => row.id?.startsWith(prefix) && ++found <= 100
  );
  const entries = [];
  for (const row of rows) {
    const { revision, provenance, document } = await checkedRow(row);
    const { id, url, language, capturedAt } = document.source;
    entries.push({
      revision,
      provenance: provenance.kind,
      platform: document.platform,
      source: { id, url, language, capturedAt },
      jobs: document.jobs.length,
    });
  }
  return {
    entries: entries.sort((a, b) =>
      b.source.capturedAt.localeCompare(a.source.capturedAt)
    ),
    truncated: found > 100,
  };
};
export const storedExperienceDocument = async (store, revision) => {
  if (typeof revision !== 'string' || !/^[a-f0-9]{64}$/u.test(revision)) {
    throw experienceDocumentFailure();
  }
  await lanes.get(store)?.catch(() => {});
  return checkedRow(await store.get(`${prefix}${revision}`));
};

/** Compare two explicit immutable revisions without changing either provider. */
export const compareStoredExperience = async (store, input) => {
  const left = await storedExperienceDocument(store, input.hh);
  const right = await storedExperienceDocument(store, input.linkedin);
  if (
    left.document.platform !== 'hh' ||
    right.document.platform !== 'linkedin'
  ) {
    throw experienceDocumentFailure();
  }
  return {
    hh: left.revision,
    linkedin: right.revision,
    comparison: compareExperience(
      left.document.jobs,
      right.document.jobs,
      input.options ?? {}
    ),
  };
};
