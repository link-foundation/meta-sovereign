import { isDeepStrictEqual } from 'node:util';
import { readExperiencePlan } from '../cv/experience-plan-service.js';
import { storedExperienceDocument } from '../cv/experience-store.js';
import { cvPrepareFailure } from './cv-prepare-record.js';
import { confirmCurrentExperienceField } from './cv-workplace-experience.js';
import { observedResumeAbout } from './resume-cv.js';
import { verifiedTechnologyCv } from './technology-cv.js';

export const hhExperienceAboutSource = async (
  context,
  { planRequestId, fingerprint }
) => {
  const row = await readExperiencePlan(context.store, {
    requestId: planRequestId,
  });
  const field = row.plan?.profile.fields.find(({ field }) => field === 'about');
  if (
    row.phase !== 'completed' ||
    row.fingerprint !== fingerprint ||
    row.plan.target.platform !== 'hh' ||
    !field?.ready ||
    typeof field.before !== 'string' ||
    typeof field.after !== 'string' ||
    !field.after.trim() ||
    field.before === field.after ||
    field.after.length > 24000
  ) {
    throw cvPrepareFailure('experience-about-plan');
  }
  const { provenance } = await storedExperienceDocument(
    context.store,
    row.plan.target.revision
  );
  if (provenance.kind !== 'hh-export') {
    throw cvPrepareFailure('experience-about-plan');
  }
  const data = await verifiedTechnologyCv(context, provenance.identity);
  if (
    !isDeepStrictEqual(data.identity, provenance.identity) ||
    observedResumeAbout(data.cv) !== field.before
  ) {
    throw cvPrepareFailure('baseline');
  }
  await confirmCurrentExperienceField(context, data, observedResumeAbout);
  const { hash, language, browserSlot } = data.identity;
  return {
    field: 'about',
    hash,
    language,
    browserSlot,
    before: field.before,
    after: field.after,
  };
};
