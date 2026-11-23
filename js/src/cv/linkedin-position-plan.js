import { isDeepStrictEqual } from 'node:util';
import { modelFingerprint } from '../automation/answer-model-context.js';
import { resumeExportRequestId } from '../jobs/resume-export-options.js';
import { readExperiencePlan } from './experience-plan-service.js';
import { storedExperienceDocument } from './experience-store.js';
import { readLinkedinEvidence } from './linkedin-experience-evidence.js';
import { linkedinExperienceDocument } from './linkedin-experience-parse.js';
import {
  checkedLinkedinExport,
  linkedinExportKey,
} from './linkedin-experience-record.js';
import { linkedinPositionEditorUrl } from './linkedin-position-editor-url.js';

export const linkedinPositionFailure = (reason) =>
  Object.assign(new Error('The LinkedIn position review was not confirmed.'), {
    code: `cv-linkedin-position-${reason}`,
  });
const hashPattern = /^[a-f0-9]{64}$/u;
export const linkedinPositionFingerprint = (value) => {
  if (typeof value !== 'string' || !hashPattern.test(value)) {
    throw linkedinPositionFailure('input');
  }
  return value;
};

const reviewReference = (input) => {
  if (
    !input ||
    Object.keys(input).length !== 3 ||
    !Number.isInteger(input.jobIndex) ||
    input.jobIndex < 0 ||
    input.jobIndex >= 801
  ) {
    throw linkedinPositionFailure('input');
  }
  return {
    requestId: resumeExportRequestId(input.requestId),
    fingerprint: linkedinPositionFingerprint(input.fingerprint),
    jobIndex: input.jobIndex,
  };
};

const nativeTarget = async ({ store, artifactRoot }, target) => {
  const { provenance, document } = await storedExperienceDocument(
    store,
    target.revision
  );
  if (
    provenance.kind !== 'linkedin-native' ||
    provenance.browserSlot !== 'linkedin-experience'
  ) {
    throw linkedinPositionFailure('source');
  }
  const { requestId } = provenance;
  try {
    const row = checkedLinkedinExport(
      await store.get(linkedinExportKey(requestId)),
      requestId
    );
    if (
      row.phase !== 'completed' ||
      row.revision !== target.revision ||
      !isDeepStrictEqual(provenance.files, row.files)
    ) {
      throw linkedinPositionFailure('evidence');
    }
    const { text } = await readLinkedinEvidence(
      artifactRoot,
      row,
      'linkedin-experience.json'
    );
    const raw = JSON.parse(text);
    const verified = linkedinExperienceDocument(
      raw,
      row.options,
      document.source.capturedAt
    );
    if (
      raw.traversal?.boundary !== 'rendered-bottom' ||
      raw.traversal.passes !== row.passes ||
      raw.items.length !== row.positions ||
      !isDeepStrictEqual(document, verified)
    ) {
      throw linkedinPositionFailure('evidence');
    }
    return { document, requestId };
  } catch {
    throw linkedinPositionFailure('evidence');
  }
};

const textLimits = {
  company: 500,
  title: 500,
  location: 500,
  description: 2000,
};
const dateFields = new Set(['start', 'end', 'current']);
const baselineFor = (job) => ({
  company: job?.company ?? '',
  title: job?.title ?? '',
  location: job?.location ?? '',
  description: job?.description ?? '',
  current: job?.current ?? null,
  start: job?.start ?? null,
  end: job?.end ?? null,
});

const skillKey = (value) => value.normalize('NFKC').trim().toLowerCase();
const newSkills = (proposal) => {
  const current = new Set((proposal.before ?? []).map(skillKey));
  const add = [];
  let limited = false;
  for (const name of proposal.after) {
    if (typeof name !== 'string' || name.length > 100) {
      limited = true;
      continue;
    }
    const key = skillKey(name);
    if (!current.has(key) && key) {
      current.add(key);
      add.push(name);
    }
  }
  return { names: add.slice(0, 100), limited: limited || add.length > 100 };
};

const mediaUrl = (value) => {
  if (typeof value !== 'string' || value.length > 2000) {
    return null;
  }
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
};
const proposedFields = (job, notes) => {
  const fields = {};
  for (const { field, ready, after } of job.fields) {
    if (Object.hasOwn(textLimits, field)) {
      if (!ready) {
        throw linkedinPositionFailure('translation');
      }
      if (after.trim() && after.length <= textLimits[field]) {
        fields[field] = after;
      } else {
        notes.push({ field, reason: 'editor-length' });
      }
    } else if (dateFields.has(field)) {
      fields[field] = after;
    } else if (field !== 'skills') {
      notes.push({ field, reason: 'manual-review' });
    }
  }
  return fields;
};

const desiredFields = (baseline, fields, operation) => {
  const desired = { ...baseline, ...fields };
  if (desired.current === true) {
    desired.end = null;
  }
  if (
    !desired.company ||
    !desired.title ||
    (desired.start &&
      desired.end &&
      desired.start.padEnd(7, '-01') > desired.end.padEnd(7, '-12')) ||
    (operation === 'add' && !desired.start) ||
    (fields.current === false && !desired.end)
  ) {
    throw linkedinPositionFailure('fields');
  }
  return desired;
};

const positionFields = (job) => {
  const baseline = baselineFor(job.target);
  const notes = [...job.notes];
  const fields = proposedFields(job, notes);
  const desired = desiredFields(baseline, fields, job.kind);
  const skillProposal = job.fields.find((item) => item.field === 'skills');
  const skills = skillProposal?.ready ? newSkills(skillProposal) : null;
  if (skillProposal && (!skills || skills.limited)) {
    notes.push({ field: 'skills', reason: 'manual-review' });
  }
  const website = job.source.native?.website;
  const url = mediaUrl(website);
  if (website && !url) {
    notes.push({ field: 'media', reason: 'manual-review' });
  }
  const existingMedia = (job.target?.media ?? []).some(
    (item) => mediaUrl(item.url) === url
  );
  return {
    baseline,
    fields,
    desired,
    skills: skills?.names ?? [],
    media: url && !existingMedia ? { url, title: desired.company } : null,
    notes,
  };
};

/** Read a selected immutable comparison and prepare a review, with no browser access. */
export const draftLinkedinPosition = async (context, input) => {
  const experience = reviewReference(input);
  const row = await readExperiencePlan(context.store, experience);
  const job = row.plan?.jobs[experience.jobIndex];
  if (
    row.phase !== 'completed' ||
    row.fingerprint !== experience.fingerprint ||
    row.plan.target.platform !== 'linkedin' ||
    !['add', 'update'].includes(job?.kind)
  ) {
    throw linkedinPositionFailure('conflict');
  }
  const { document, requestId } = await nativeTarget(context, row.plan.target);
  const target = document.jobs[job.targetIndex];
  if (job.kind === 'update' && !isDeepStrictEqual(target, job.target)) {
    throw linkedinPositionFailure('conflict');
  }
  const editor = linkedinPositionEditorUrl(
    job.kind === 'add'
      ? document.profile.positionEditor
      : target.native.positionEditor,
    document.source.url,
    job.kind
  );
  if (!editor) {
    throw linkedinPositionFailure('editor');
  }
  const proposal = positionFields(job);
  if (
    !Object.keys(proposal.fields).length &&
    !proposal.skills.length &&
    !proposal.media
  ) {
    throw linkedinPositionFailure('note');
  }
  const plan = {
    version: 1,
    phase: 'draft',
    experience,
    operation: job.kind,
    browserSlot: 'linkedin-experience',
    target: { ...row.plan.target, exportRequestId: requestId },
    editor,
    ...proposal,
    providerSaved: false,
  };
  return { ...plan, fingerprint: await modelFingerprint(plan) };
};
