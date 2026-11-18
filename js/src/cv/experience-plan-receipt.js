import { modelFingerprint } from '../automation/answer-model-context.js';
import { resumeExportRequestId } from '../jobs/resume-export-options.js';
import {
  experiencePlanFailure,
  experiencePlanOptions,
} from './experience-plan-record.js';
import {
  experienceTranslationTexts,
  applyExperienceTranslations,
} from './experience-plan.js';
import {
  experienceTranslationBatches,
  checkedExperienceTranslations,
} from './experience-plan-translation.js';

const validIdentity = (plan, options) =>
  plan.version === 1 &&
  plan.target.platform === options.to &&
  plan.source.platform === (options.to === 'hh' ? 'linkedin' : 'hh') &&
  plan.target.revision === options[plan.target.platform] &&
  plan.source.revision === options[plan.source.platform];
const validPlan = async (content, requestId) =>
  JSON.stringify(experiencePlanOptions(content.options)) ===
    JSON.stringify(content.options) &&
  content.options.requestId === requestId &&
  Array.isArray(content.plan.jobs) &&
  content.plan.kind === 'cv-experience-plan' &&
  content.plan.requiresReview === true &&
  content.plan.providerSaved === false &&
  validIdentity(content.plan, content.options) &&
  (await modelFingerprint(content.plan.input)) ===
    (await modelFingerprint(content.options));

/** Verify transport integrity and exact batch identities before rendering translated fields. */
export const confirmedExperiencePlan = async (answer, requestId) => {
  const { fingerprint, ...content } = answer ?? {};
  if (
    content.requestId !== resumeExportRequestId(requestId) ||
    ![
      'planning',
      'translating',
      'completed',
      'failed',
      'stopped',
      'interrupted',
      'unknown',
    ].includes(content.phase) ||
    content.requiresReview !== true ||
    content.providerSaved !== false ||
    fingerprint !== (await modelFingerprint(content)) ||
    !!content.options !== !!content.plan ||
    (!content.options && content.phase !== 'stopped')
  ) {
    throw experiencePlanFailure('receipt');
  }
  if (content.options) {
    if (!(await validPlan(content, requestId))) {
      throw experiencePlanFailure('receipt');
    }
    const batches = await experienceTranslationBatches(
      { ...content.options, toLanguage: content.plan.target.language },
      experienceTranslationTexts(content.plan)
    );
    await checkedExperienceTranslations(
      content.plan.translations,
      batches,
      content.phase === 'completed'
    );
    if (
      (await modelFingerprint(
        applyExperienceTranslations(content.plan, content.plan.translations)
      )) !== (await modelFingerprint(content.plan))
    ) {
      throw experiencePlanFailure('receipt');
    }
  }
  return answer;
};
