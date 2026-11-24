import { isDeepStrictEqual } from 'node:util';
import {
  confirmedHhWorkplaceJob,
  hhExperienceWorkplaceRunning,
} from './experience-hh-workplace-receipt.js';
import {
  confirmedLinkedinPositionJob,
  confirmedLinkedinPositionReview,
  linkedinPositionPending,
} from './linkedin-position-receipt.js';
import {
  linkedinPositionValues,
  linkedinPositionSkillKey,
} from './linkedin-position-plan.js';
import { linkedinPositionMediaUrl } from './linkedin-position-media-link.js';
import { cvWorkplacePlanJob } from '../jobs/cv-workplace-plan.js';
import { cvWorkplaceExportJobFingerprint } from '../jobs/cv-watch-verification.js';
import { experienceReviewFailure } from './experience-review-record.js';
import {
  confirmedLinkedinAboutJob,
  linkedinAboutRunning,
} from './linkedin-about-receipt.js';
import { linkedinAboutText } from './linkedin-about-native.js';

const matchesReference = (value, source) =>
  value?.requestId === source.requestId &&
  value.fingerprint === source.fingerprint &&
  value.jobIndex === source.jobIndex;
const browserlessNotes = new Set([
  'cv-linkedin-position-editor',
  'cv-linkedin-position-fields',
  'cv-linkedin-position-note',
  'cv-linkedin-position-translation',
  'jobs-cv-experience-note',
  'jobs-cv-experience-translation',
]);
const validWorkplace = (plan, reference, kind) =>
  matchesReference(plan?.experience, reference) &&
  (kind === 'add' ? plan.operation === 'add' : plan.operation === undefined);

const planAbout = (plan, input) => {
  const about = plan.plan.profile.fields.find(({ field }) => field === 'about');
  if (!about) {
    return { unchanged: true };
  }
  if (
    !about.ready ||
    typeof about.before !== 'string' ||
    typeof about.after !== 'string' ||
    !about.after.trim() ||
    about.after.length > 24000
  ) {
    return { code: experienceReviewFailure('manual-about').code };
  }
  return { kind: `${plan.plan.target.platform}-about`, input };
};

const reviewWorkplace = async (vacancies, reference, operation, requestId) => {
  const { plan: draft } = await vacancies['cv-workplace-plan']({
    experience: reference,
  });
  if (
    !validWorkplace(draft, reference, operation) ||
    draft.status !== 'draft'
  ) {
    throw experienceReviewFailure('native-plan');
  }
  const { browserSlot } = draft;
  const { plan: review } = await vacancies['cv-workplace-review']({
    browserSlot,
    fingerprint: draft.fingerprint,
  });
  if (
    !validWorkplace(review, reference, operation) ||
    review.status !== 'reviewed' ||
    review.browserSlot !== browserSlot ||
    review.previousFingerprint !== draft.fingerprint
  ) {
    throw experienceReviewFailure('native-plan');
  }
  return {
    kind: 'hh-workplace',
    input: { requestId, fingerprint: review.fingerprint, browserSlot },
    notes: review.experience.unapplied.map((field) => ({
      field,
      reason: 'manual-review',
    })),
  };
};

const reviewPosition = async (reviews, reference, operation, requestId) => {
  const matches = (answer) =>
    matchesReference(answer.experience, reference) &&
    answer.operation === operation;
  const draft = await confirmedLinkedinPositionReview(
    await reviews.stage(reference),
    (answer) => answer.phase === 'draft' && matches(answer)
  );
  const review = await confirmedLinkedinPositionReview(
    await reviews.review({ fingerprint: draft.fingerprint }),
    (answer) =>
      answer.phase === 'reviewed' &&
      answer.draftFingerprint === draft.fingerprint &&
      matches(answer)
  );
  return {
    kind: 'linkedin-position',
    input: { requestId, fingerprint: review.fingerprint },
    notes: review.notes.map(({ field, reason }) => ({ field, reason })),
  };
};

const verifyPosition = (document, save) => {
  const matches = document.jobs.filter(
    (job) => job.native.positionEditor === save.editor
  );
  if (
    matches.length !== 1 ||
    document.source.url !== save.source.url ||
    document.source.id !== save.source.id
  ) {
    return false;
  }
  const job = matches[0];
  const skills = new Set((job.skills ?? []).map(linkedinPositionSkillKey));
  return (
    isDeepStrictEqual(linkedinPositionValues(job), save.values) &&
    (save.skills ?? []).every((name) =>
      skills.has(linkedinPositionSkillKey(name))
    ) &&
    (!save.media ||
      (job.media ?? []).some(
        ({ url, title }) =>
          linkedinPositionMediaUrl(url) === save.media.url &&
          title === save.media.title
      ))
  );
};

const verifyWorkplace = async (getVacancies, document, source, input) => {
  if (!source?.workplace?.checked) {
    return false;
  }
  const { plan } = await getVacancies()['cv-workplace-plan-stored']({
    browserSlot: input.browserSlot,
    fingerprint: input.fingerprint,
  });
  if (
    plan?.fingerprint !== input.fingerprint ||
    plan.status !== 'reviewed' ||
    plan.source.identity.hash !== source.hash
  ) {
    return false;
  }
  const expected = cvWorkplaceExportJobFingerprint({
    ...cvWorkplacePlanJob(plan, 'desired', document.source.language),
    areaId: plan.desired.areaId,
  });
  return (
    document.jobs.filter(
      (job) => cvWorkplaceExportJobFingerprint(job.native) === expected
    ).length === 1
  );
};

const verifySnapshot = (before, { revision, document }) =>
  revision !== before.revision &&
  document.platform === before.document.platform &&
  document.source.id === before.document.source.id &&
  document.source.language === before.document.source.language &&
  Date.parse(document.source.capturedAt) >=
    Date.parse(before.document.source.capturedAt);

export const createExperienceReviewNative = ({
  getVacancies,
  getHhWorkplace,
  getLinkedinPosition,
  getLinkedinReviews,
  getLinkedinAbout,
  checkLinkedinAbout,
}) => ({
  async prepare(plan, key, requestId) {
    const { requestId: planRequestId, fingerprint } = plan;
    if (key === 'about') {
      const item = planAbout(plan, { requestId, planRequestId, fingerprint });
      if (item.kind === 'linkedin-about') {
        try {
          await checkLinkedinAbout(item.input);
        } catch (error) {
          if (
            ['cv-linkedin-about-source', 'cv-linkedin-about-baseline'].includes(
              error.code
            )
          ) {
            return { code: error.code };
          }
          throw error;
        }
      }
      return item;
    }
    const sourceIndex = Number(key.slice('position-'.length));
    const jobIndex = plan.plan.jobs.findIndex(
      (job) => job.sourceIndex === sourceIndex
    );
    const job = plan.plan.jobs[jobIndex];
    if (!job || !['add', 'update'].includes(job.kind)) {
      return { code: experienceReviewFailure('manual-match').code };
    }
    if (!job.fields.length) {
      return { unchanged: true };
    }
    const reference = { requestId: planRequestId, fingerprint, jobIndex };
    try {
      return await (plan.plan.target.platform === 'hh'
        ? reviewWorkplace(getVacancies(), reference, job.kind, requestId)
        : reviewPosition(getLinkedinReviews(), reference, job.kind, requestId));
    } catch (error) {
      if (browserlessNotes.has(error.code)) {
        return { code: error.code };
      }
      throw error;
    }
  },

  reviewer({ kind, input }) {
    if (kind === 'linkedin-about') {
      const service = getLinkedinAbout();
      const confirm = (row) => confirmedLinkedinAboutJob(row, input);
      return {
        start: async () => confirm(await service.start(input)),
        status: async () =>
          confirm(await service.status({ requestId: input.requestId })),
        stop: async () =>
          confirm(await service.stop({ requestId: input.requestId })),
        decide: async (decision) =>
          confirm(await service.decide({ ...input, decision })),
        running: linkedinAboutRunning,
      };
    }
    const linkedin = kind === 'linkedin-position';
    const service = linkedin ? getLinkedinPosition() : getHhWorkplace();
    const confirmed = (row) => {
      if (!row.options || !isDeepStrictEqual(row.options, input)) {
        throw experienceReviewFailure('native-receipt');
      }
      return linkedin
        ? confirmedLinkedinPositionJob(row, input.requestId, input.fingerprint)
        : confirmedHhWorkplaceJob(row, input.requestId, input);
    };
    const request = { requestId: input.requestId };
    return {
      start: async () => confirmed(await service.start(input)),
      status: async () => confirmed(await service.status(request)),
      stop: async () => confirmed(await service.stop(request)),
      decide: async (decision) =>
        confirmed(await service.decide({ ...input, decision })),
      running: linkedin
        ? linkedinPositionPending
        : hhExperienceWorkplaceRunning,
    };
  },

  async confirmFresh({ kind, input }, plan, { save }, before, fresh) {
    if (!verifySnapshot(before, fresh)) {
      throw experienceReviewFailure('readback');
    }
    const { document, provenance } = fresh;
    let matching;
    if (kind === 'linkedin-position') {
      matching = verifyPosition(document, save);
    } else if (kind === 'linkedin-about') {
      const about = plan.plan.profile.fields.find(
        ({ field }) => field === 'about'
      );
      matching =
        provenance.kind === 'linkedin-native' &&
        document.source.id === save.source.id &&
        document.source.url === save.source.url &&
        document.profile.aboutAcquisition?.observed === true &&
        document.profile.about === save.about &&
        document.profile.about === linkedinAboutText(about.after);
    } else {
      const source = save.exports.find(
        ({ hash }) => hash === provenance.identity?.hash
      );
      const about = plan.plan.profile.fields.find(
        ({ field }) => field === 'about'
      );
      matching =
        kind === 'hh-about'
          ? source && document.profile.about === about?.after
          : await verifyWorkplace(getVacancies, document, source, input);
    }
    if (!matching) {
      throw experienceReviewFailure('readback');
    }
  },
});
