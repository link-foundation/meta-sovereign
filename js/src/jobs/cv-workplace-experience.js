import { modelFingerprint } from '../automation/answer-model-context.js';
import { readExperiencePlan } from '../cv/experience-plan-service.js';
import { storedExperienceDocument } from '../cv/experience-store.js';
import { cvSnapshotsResult } from './cv-watch-record.js';
import {
  cvAreaIdentity,
  cvLocalizedEntry,
} from './cv-workplace-dictionaries.js';
import { cvWorkplaceFail, cvWorkplaceRecordId } from './cv-workplace-plan.js';
import { verifiedTechnologyCv } from './technology-cv.js';

const nativeFields = new Map([
  ['company', 'company'],
  ['title', 'position'],
  ['description', 'description'],
  ['start', 'start'],
  ['end', 'end'],
  ['current', 'current'],
  ['location', 'areaId'],
]);

export const confirmCurrentExperienceWorkplaces = async (options, data) => {
  const { browserSlot, hash, exportId, capturedAt } = data.identity;
  const latest = await options.store.get(
    `jobs-resume-export:${browserSlot}:${hash}`
  );
  if (!latest) {
    cvWorkplaceFail('conflict');
  }
  if (latest.exportId !== exportId) {
    const newer = await verifiedTechnologyCv(options, {
      browserSlot,
      hash,
      exportId: latest.exportId,
    });
    if (
      (await modelFingerprint(newer.cv.jobs)) !==
      (await modelFingerprint(data.cv.jobs))
    ) {
      cvWorkplaceFail('conflict');
    }
  }
  const saved = await options.store.get(`jobs-cv-snapshots:${browserSlot}`);
  if (saved) {
    const { snapshots } = cvSnapshotsResult(saved, { browserSlot });
    const newer = snapshots.find(
      (row) =>
        row.hash === hash && Date.parse(row.savedAt) >= Date.parse(capturedAt)
    );
    if (
      newer &&
      (await modelFingerprint(newer.cv.jobs)) !==
        (await modelFingerprint(data.cv.jobs))
    ) {
      cvWorkplaceFail('conflict');
    }
  }
};

const checkedWorkplaceItem = async (store, input) => {
  const { experience, recordId } = input;
  if (
    Object.keys(input).some(
      (key) => !['experience', 'recordId', 'browserSlot'].includes(key)
    ) ||
    !Number.isInteger(experience?.jobIndex) ||
    experience.jobIndex < 0 ||
    !/^[a-f\d]{64}$/u.test(experience.fingerprint ?? '') ||
    Object.keys(experience).length !== 3
  ) {
    cvWorkplaceFail('options');
  }
  const { requestId, fingerprint, jobIndex } = experience;
  const row = await readExperiencePlan(store, { requestId });
  const job = row.plan?.jobs[jobIndex];
  if (
    row.phase !== 'completed' ||
    row.fingerprint !== fingerprint ||
    row.plan.target.platform !== 'hh' ||
    !['add', 'update'].includes(job?.kind)
  ) {
    cvWorkplaceFail('conflict');
  }
  if (job.kind === 'update' && recordId !== undefined) {
    cvWorkplaceRecordId(recordId);
  } else if (recordId !== undefined) {
    cvWorkplaceFail('options');
  }
  return { row, job };
};

export const cvWorkplaceExperienceSource = async (options, input) => {
  const { experience, recordId, browserSlot } = input;
  const { row, job } = await checkedWorkplaceItem(options.store, input);
  const { provenance } = await storedExperienceDocument(
    options.store,
    row.plan.target.revision
  );
  if (
    provenance.kind !== 'hh-export' ||
    (browserSlot !== undefined &&
      browserSlot !== provenance.identity?.browserSlot)
  ) {
    cvWorkplaceFail('conflict');
  }
  const data = await verifiedTechnologyCv(options, provenance.identity);
  if (
    (await modelFingerprint(data.identity)) !==
      (await modelFingerprint(provenance.identity)) ||
    (job.kind === 'update' &&
      (!job.target?.native ||
        !data.cv.jobs[job.targetIndex] ||
        (await modelFingerprint(job.target.native)) !==
          (await modelFingerprint(data.cv.jobs[job.targetIndex]))))
  ) {
    cvWorkplaceFail('conflict');
  }
  await confirmCurrentExperienceWorkplaces(options, data);
  return {
    data,
    job,
    recordId,
    createdAt: row.createdAt,
    reference: {
      requestId: experience.requestId,
      fingerprint: experience.fingerprint,
      jobIndex: experience.jobIndex,
    },
  };
};

const exactArea = (name, dictionaries) => {
  try {
    const id = cvAreaIdentity(name, dictionaries);
    return id ? cvLocalizedEntry(dictionaries.areas, id).id : null;
  } catch (error) {
    if (
      !['jobs-areas-unavailable', 'jobs-cv-dictionary'].includes(error.code)
    ) {
      throw error;
    }
    return null;
  }
};

/** The report keeps original fields. The native draft contains only supported changes. */
export const cvWorkplaceExperienceFields = (job, dictionaries) => {
  const fields = {};
  const unapplied = [];
  for (const { field, ready, after, source } of job.fields) {
    const native = nativeFields.get(field);
    if (!native) {
      unapplied.push(field);
    } else if (field === 'location') {
      const original = exactArea(source, dictionaries);
      const translated =
        ready && after !== source ? exactArea(after, dictionaries) : null;
      const id =
        original && translated && original !== translated
          ? null
          : (original ?? translated);
      if (id) {
        fields.areaId = id;
      } else {
        unapplied.push(field);
      }
    } else if (!ready) {
      cvWorkplaceFail('experience-translation');
    } else {
      fields[native] = after;
    }
  }
  return { fields, unapplied };
};
