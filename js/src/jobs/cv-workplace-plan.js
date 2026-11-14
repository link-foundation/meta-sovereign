import { browserName } from '../browser/policy.js';
import { modelFingerprint } from '../automation/answer-model-context.js';
import { resumeExportId } from './resume-export-result.js';
import { resumeHash } from './resume-list.js';
import { cvWorkplaceMembership } from './cv-workplace-membership.js';
import { sanitizedResumeCv } from './resume-cv.js';
import { cvPrepareFailure } from './cv-prepare-record.js';

export const cvWorkplaceFields = [
  'company',
  'position',
  'description',
  'start',
  'end',
  'current',
  'areaId',
  'website',
  'industryIds',
];
export const cvWorkplaceFail = (code = 'review') => {
  throw cvPrepareFailure(code);
};
export const cvWorkplaceRecordId = (value) => {
  if (typeof value !== 'string' || !/^\d{1,100}$/u.test(value)) {
    cvWorkplaceFail('options');
  }
  return value;
};
const boundedText = (value, max, empty = true) => {
  if (
    typeof value !== 'string' ||
    value.length > max ||
    value.includes('\0') ||
    (!empty && !value.trim())
  ) {
    cvWorkplaceFail();
  }
};
const validateDates = (raw) => {
  const month = (value) =>
    typeof value === 'string' &&
    /^(?:19|20)\d{2}-(?:0[1-9]|1[0-2])$/u.test(value);
  if (
    !month(raw.start) ||
    typeof raw.current !== 'boolean' ||
    (raw.current ? raw.end !== null : !month(raw.end) || raw.end < raw.start)
  ) {
    cvWorkplaceFail();
  }
};
const validateDictionaryIds = (raw) => {
  if (
    raw.areaId !== null &&
    (typeof raw.areaId !== 'string' || !/^\d{1,12}$/u.test(raw.areaId))
  ) {
    cvWorkplaceFail();
  }
  if (
    !Array.isArray(raw.industryIds) ||
    raw.industryIds.length > 5 ||
    new Set(raw.industryIds).size !== raw.industryIds.length ||
    raw.industryIds.some(
      (id) => typeof id !== 'string' || !/^\d{1,8}\.\d{1,8}$/u.test(id)
    )
  ) {
    cvWorkplaceFail();
  }
};
const validateWebsite = (raw) => {
  if (raw.website) {
    let url;
    try {
      url = new URL(
        /^https?:\/\//iu.test(raw.website)
          ? raw.website
          : `https://${raw.website}`
      );
    } catch {
      cvWorkplaceFail();
    }
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      !url.hostname.includes('.') ||
      url.username ||
      url.password
    ) {
      cvWorkplaceFail();
    }
  }
};
export const cvWorkplaceValues = (raw) => {
  if (
    !raw ||
    Object.keys(raw).length !== cvWorkplaceFields.length ||
    cvWorkplaceFields.some((field) => !Object.hasOwn(raw, field))
  ) {
    cvWorkplaceFail();
  }
  for (const field of ['company', 'position', 'website']) {
    boundedText(raw[field], 500, field === 'website');
  }
  boundedText(raw.description, 24000);
  validateDates(raw);
  validateDictionaryIds(raw);
  validateWebsite(raw);
  return Object.fromEntries(
    cvWorkplaceFields.map((field) => [
      field,
      field === 'industryIds' ? [...raw[field]].sort() : raw[field],
    ])
  );
};
export const cvWorkplaceJobValues = (job, areaId) =>
  cvWorkplaceValues({
    ...Object.fromEntries(
      cvWorkplaceFields
        .filter((field) => !['areaId', 'industryIds'].includes(field))
        .map((field) => [field, job[field]])
    ),
    areaId,
    industryIds: job.industries.map((row) => row.id),
  });
export const cvWorkplaceDifferences = (before, after) =>
  cvWorkplaceFields
    .filter(
      (field) => JSON.stringify(before[field]) !== JSON.stringify(after[field])
    )
    .map((field) => ({ field, before: before[field], after: after[field] }));
export const cvWorkplaceSourceShape = (source) => {
  const id = source?.identity;
  resumeExportId(id?.exportId);
  resumeHash(id.hash);
  browserName(id.browserSlot);
  const job = sanitizedResumeCv({
    language: id.language,
    title: id.title,
    skills: [],
    about: '',
    jobs: [source.job],
  }).cv.jobs[0];
  if (
    JSON.stringify(job) !== JSON.stringify(source.job) ||
    !Number.isInteger(source.jobIndex) ||
    source.jobIndex < 0 ||
    source.jobIndex > 199 ||
    !/^[a-f\d]{64}$/u.test(id.sha256) ||
    !Number.isFinite(Date.parse(id.capturedAt))
  ) {
    cvWorkplaceFail();
  }
};
const metadataShape = (plan) => {
  const { metadata, baseline, desired } = plan;
  for (const [kind, ids] of [
    ['areas', [baseline.areaId, desired.areaId].filter(Boolean)],
    ['industries', [...baseline.industryIds, ...desired.industryIds]],
  ]) {
    const rows = metadata?.[kind];
    const unique = [...new Set(ids)].sort();
    if (
      !Array.isArray(rows) ||
      JSON.stringify(rows.map((row) => row.id).sort()) !==
        JSON.stringify(unique)
    ) {
      cvWorkplaceFail();
    }
    for (const row of rows) {
      for (const language of ['ru', 'en']) {
        boundedText(row[language]?.name, 500, false);
        boundedText(row[language]?.parent, 500);
      }
    }
  }
  const sourceArea = metadata.areas.find((row) => row.id === baseline.areaId);
  if (
    baseline.areaId === null
      ? plan.source.job.area !== ''
      : !['ru', 'en'].some(
          (language) => sourceArea[language].name === plan.source.job.area
        )
  ) {
    cvWorkplaceFail();
  }
};
export const fingerprintCvWorkplacePlan = async (content) => ({
  ...content,
  fingerprint: await modelFingerprint(content),
});
export const cvWorkplacePlanJob = (plan, kind, language) => {
  const fields = plan[kind];
  return {
    ...Object.fromEntries(
      [
        'company',
        'position',
        'description',
        'start',
        'end',
        'current',
        'website',
      ].map((field) => [field, fields[field]])
    ),
    area:
      plan.metadata.areas.find((row) => row.id === fields.areaId)?.[language]
        .name ?? '',
    industries: fields.industryIds.map((id) => {
      const entry = plan.metadata.industries.find((row) => row.id === id);
      return { id, ...entry[language] };
    }),
  };
};
const validateProposedPrivacy = (plan) => {
  const wanted = cvWorkplacePlanJob(
    plan,
    'desired',
    plan.source.identity.language
  );
  const sanitized = sanitizedResumeCv({
    language: plan.source.identity.language,
    title: plan.source.identity.title,
    about: '',
    skills: [],
    jobs: [{ ...wanted, period: '' }],
  }).cv.jobs[0];
  if (
    JSON.stringify({ ...wanted, period: '' }) !==
    JSON.stringify(
      Object.fromEntries(
        [...Object.keys(wanted), 'period'].map((key) => [key, sanitized[key]])
      )
    )
  ) {
    cvWorkplaceFail();
  }
};
const validateFieldBindings = (plan, fields) => {
  if (
    fields &&
    Object.keys(fields).some(
      (key) =>
        JSON.stringify(
          key === 'industryIds' && Array.isArray(fields[key])
            ? [...fields[key]].sort()
            : fields[key]
        ) !== JSON.stringify(plan.desired[key])
    )
  ) {
    cvWorkplaceFail('conflict');
  }
};
const validateInputBindings = (plan, input) => {
  validateFieldBindings(plan, input.fields);
  for (const field of ['browserSlot', 'recordId', 'operation']) {
    if (input[field] !== undefined && input[field] !== plan[field]) {
      cvWorkplaceFail('conflict');
    }
  }
  for (const field of ['exportId', 'hash']) {
    if (
      input[field] !== undefined &&
      input[field] !== plan.source.identity[field]
    ) {
      cvWorkplaceFail('conflict');
    }
  }
  if (
    (input.jobIndex !== undefined && input.jobIndex !== plan.source.jobIndex) ||
    (input.resumes &&
      JSON.stringify(
        cvWorkplaceMembership(input.resumes, plan.source.identity.hash)
      ) !== JSON.stringify(plan.membership))
  ) {
    cvWorkplaceFail('conflict');
  }
  if (
    input.fingerprint &&
    input.fingerprint !==
      (input.reviewing ? plan.previousFingerprint : plan.fingerprint)
  ) {
    cvWorkplaceFail('conflict');
  }
};
const validatePlanEnvelope = (plan) => {
  if (
    !plan ||
    JSON.stringify(plan).length > 128 * 1024 ||
    plan.version !== 1 ||
    !['draft', 'reviewed'].includes(plan.status) ||
    !Number.isFinite(Date.parse(plan.createdAt))
  ) {
    cvWorkplaceFail();
  }
  if (
    plan.status === 'reviewed' &&
    (!/^[a-f\d]{64}$/u.test(plan.previousFingerprint) ||
      !Number.isFinite(Date.parse(plan.reviewedAt)))
  ) {
    cvWorkplaceFail();
  }
};
/** Recompute every report and identity; a server reply is never implicit approval. */
export const confirmedCvWorkplacePlan = async (answer, input = {}) => {
  const plan = answer?.plan;
  if (plan === null && !input.fingerprint) {
    return { plan: null };
  }
  validatePlanEnvelope(plan);
  cvWorkplaceSourceShape(plan.source);
  cvWorkplaceRecordId(plan.recordId);
  const baseline = cvWorkplaceValues(plan.baseline);
  const desired = cvWorkplaceValues(plan.desired);
  if (
    plan.browserSlot !== plan.source.identity.browserSlot ||
    JSON.stringify(baseline) !==
      JSON.stringify(cvWorkplaceJobValues(plan.source.job, baseline.areaId))
  ) {
    cvWorkplaceFail();
  }
  metadataShape(plan);
  validateProposedPrivacy(plan);
  const changes = cvWorkplacePlanDifferences({ ...plan, baseline, desired });
  if (
    !changes.length ||
    JSON.stringify(changes) !== JSON.stringify(plan.changes)
  ) {
    cvWorkplaceFail();
  }
  validateInputBindings(plan, input);
  const { fingerprint, ...content } = plan;
  if (fingerprint !== (await modelFingerprint(content))) {
    cvWorkplaceFail();
  }
  return { plan };
};

/** Membership-only plans never authorize changes to a workplace field. */
export const cvWorkplacePlanDifferences = (plan) => {
  const changes = cvWorkplaceDifferences(plan.baseline, plan.desired);
  if (plan.operation === undefined) {
    if (plan.membership !== undefined) {
      cvWorkplaceFail();
    }
    return changes;
  }
  if (plan.operation !== 'detach' || changes.length) {
    cvWorkplaceFail();
  }
  const expected = cvWorkplaceMembership(
    plan.membership?.before,
    plan.source.identity.hash
  );
  if (JSON.stringify(expected) !== JSON.stringify(plan.membership)) {
    cvWorkplaceFail();
  }
  return [{ field: 'resumes', ...expected }];
};
