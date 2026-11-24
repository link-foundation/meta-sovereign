import path from 'node:path';
import { defaultStoreDir } from '../storage/app-directory.js';
import { json, readBody } from './util.js';
import { isTrustedMutation } from './routes-auto-import.js';
import {
  saveExperienceDocument,
  storedExperienceDocuments,
  storedExperienceDocument,
  compareStoredExperience,
} from '../cv/experience-store.js';
import { experienceFromHhExport } from '../cv/experience-hh.js';
import { createHhExperienceAcquisition } from '../cv/experience-hh-acquisition.js';
import { createHhExperienceWorkplaceJobs } from '../cv/experience-hh-workplace-job.js';
import { createLinkedinExperienceService } from '../cv/linkedin-experience-service.js';
import { createExperiencePlanningService } from '../cv/experience-plan-service.js';
import { createExperienceAutoService } from '../cv/experience-auto-service.js';
import { experienceAutoFailure } from '../cv/experience-auto-record.js';
import { createExperienceReviewService } from '../cv/experience-review-service.js';
import { createExperienceReviewNative } from '../cv/experience-review-native.js';
import { experienceReviewFailure } from '../cv/experience-review-record.js';
import { createLinkedinPositionReviews } from '../cv/linkedin-position-review.js';
import { createLinkedinPositionJobs } from '../cv/linkedin-position-job.js';
import {
  createLinkedinAboutJobs,
  linkedinAboutPlan,
} from '../cv/linkedin-about-job.js';
import { linkedinAboutFailure } from '../cv/linkedin-about-native.js';
import {
  createFormalExperienceReports,
  previewFormalExperienceReport,
} from '../cv/formal-report-service.js';
import { workspaceVacancies } from './routes-vacancies.js';

const hhExportOptions = (store, ctx) => ({
  store,
  artifactRoot:
    ctx.vacancyOptions?.artifactRoot ??
    path.join(ctx.storeDir ?? defaultStoreDir(), 'resume-exports'),
});

const hhAcquisition = (store, ctx) => {
  if (ctx.cvExperienceClosing) {
    throw Object.assign(
      new Error('HeadHunter experience export has stopped.'),
      {
        code: 'cv-hh-acquisition-stopped',
        status: 503,
      }
    );
  }
  return (ctx.cvHhAcquisition ??= createHhExperienceAcquisition({
    ...hhExportOptions(store, ctx),
    getVacancies: () => workspaceVacancies(store, ctx),
  }));
};

const hhWorkplaceJobs = (store, ctx) => {
  if (ctx.cvExperienceClosing) {
    throw Object.assign(new Error('HeadHunter workplace review has stopped.'), {
      code: 'cv-hh-workplace-stopped',
      status: 503,
    });
  }
  return (ctx.cvHhWorkplaceJobs ??= createHhExperienceWorkplaceJobs({
    ...hhExportOptions(store, ctx),
    storeDir: ctx.storeDir ?? defaultStoreDir(),
    ...ctx.cvExperienceOptions?.hhWorkplace,
  }));
};

const formalReports = (store, ctx) => {
  if (ctx.cvExperienceClosing) {
    throw Object.assign(new Error('Experience reporting has stopped.'), {
      status: 503,
    });
  }
  return (ctx.cvFormalReports ??= createFormalExperienceReports({
    store,
    ...ctx.cvFormalReportOptions,
  }));
};

const planningService = (store, ctx) => {
  if (ctx.cvExperienceClosing) {
    throw Object.assign(new Error('Experience planning has stopped.'), {
      code: 'cv-experience-plan-stopped',
      status: 503,
    });
  }
  return (ctx.cvExperiencePlans ??= createExperiencePlanningService({
    store,
    ...ctx.cvExperiencePlanningOptions,
  }));
};

const linkedinService = (store, ctx) => {
  if (ctx.cvExperienceClosing) {
    throw Object.assign(new Error('Experience exports have stopped.'), {
      code: 'cv-linkedin-stopped',
      status: 503,
    });
  }
  return (ctx.cvExperience ??= createLinkedinExperienceService({
    store,
    artifactRoot: path.join(
      ctx.storeDir ?? defaultStoreDir(),
      'experience-exports'
    ),
    ...ctx.cvExperienceOptions,
  }));
};

const experienceAuto = (store, ctx) => {
  if (ctx.cvExperienceClosing) {
    throw experienceAutoFailure('stopped');
  }
  return (ctx.cvExperienceAuto ??= createExperienceAutoService({
    store,
    getHh: () => hhAcquisition(store, ctx),
    getLinkedin: () => linkedinService(store, ctx),
    getPlan: () => planningService(store, ctx),
  }));
};

const positionOptions = (store, ctx) => ({
  store,
  artifactRoot:
    ctx.cvExperienceOptions?.artifactRoot ??
    path.join(ctx.storeDir ?? defaultStoreDir(), 'experience-exports'),
});

const positionJobs = (store, ctx) => {
  if (ctx.cvExperienceClosing) {
    throw Object.assign(
      new Error('LinkedIn position preparation has stopped.'),
      {
        code: 'cv-linkedin-position-stopped',
        status: 503,
      }
    );
  }
  return (ctx.cvLinkedinPositionJobs ??= createLinkedinPositionJobs({
    ...positionOptions(store, ctx),
    ...ctx.cvExperienceOptions?.position,
  }));
};

const aboutOptions = (store, ctx) => ({
  ...positionOptions(store, ctx),
  ...ctx.cvExperienceOptions?.about,
});

const linkedinAboutJobs = (store, ctx) => {
  if (ctx.cvExperienceClosing) {
    throw linkedinAboutFailure('stopped');
  }
  return (ctx.cvLinkedinAboutJobs ??= createLinkedinAboutJobs(
    aboutOptions(store, ctx)
  ));
};

const experienceReview = (store, ctx) => {
  if (ctx.cvExperienceClosing) {
    throw experienceReviewFailure('stopped');
  }
  return (ctx.cvExperienceReview ??= createExperienceReviewService({
    store,
    getAuto: () => experienceAuto(store, ctx),
    getHh: () => hhAcquisition(store, ctx),
    getLinkedin: () => linkedinService(store, ctx),
    getPlan: () => planningService(store, ctx),
    native: createExperienceReviewNative({
      getVacancies: () => workspaceVacancies(store, ctx),
      getHhWorkplace: () => hhWorkplaceJobs(store, ctx),
      getLinkedinPosition: () => positionJobs(store, ctx),
      getLinkedinAbout: () => linkedinAboutJobs(store, ctx),
      checkLinkedinAbout: (input) =>
        linkedinAboutPlan(aboutOptions(store, ctx), input),
      getLinkedinReviews: () =>
        createLinkedinPositionReviews(positionOptions(store, ctx)),
    }),
  }));
};

const actions = {
  stored: (store) => storedExperienceDocuments(store),
  document: (store, input) => storedExperienceDocument(store, input.revision),
  import: (store, input) => saveExperienceDocument(store, input.document),
  'from-hh': (store, input, ctx) =>
    experienceFromHhExport(hhExportOptions(store, ctx), input),
  ...Object.fromEntries(
    ['start', 'status', 'stop'].map((operation) => [
      `hh-${operation}`,
      (store, input, ctx) => hhAcquisition(store, ctx)[operation](input),
    ])
  ),
  ...Object.fromEntries(
    ['workplace', 'about'].flatMap((kind) =>
      ['start', 'status', 'stop', 'decide'].map((operation) => [
        `hh-${kind}-${operation}`,
        (store, input, ctx) => {
          if (
            ['start', 'decide'].includes(operation) &&
            (kind === 'about') !== (typeof input.planRequestId === 'string')
          ) {
            throw Object.assign(
              new Error('The review plan was not confirmed.'),
              {
                code: 'cv-hh-workplace-input',
              }
            );
          }
          return hhWorkplaceJobs(store, ctx)[operation](input);
        },
      ])
    )
  ),
  compare: (store, input) => compareStoredExperience(store, input),
  ...Object.fromEntries(
    ['start', 'status', 'stop', 'resume'].map((operation) => [
      `auto-${operation}`,
      (store, input, ctx) => experienceAuto(store, ctx)[operation](input),
    ])
  ),
  ...Object.fromEntries(
    ['start', 'status', 'stop', 'resume', 'decide'].map((operation) => [
      `review-${operation}`,
      (store, input, ctx) => experienceReview(store, ctx)[operation](input),
    ])
  ),
  'report-preview': (store, input) =>
    previewFormalExperienceReport(store, input),
  ...Object.fromEntries(
    ['start', 'status', 'stop'].map((operation) => [
      `report-${operation}`,
      (store, input, ctx) => formalReports(store, ctx)[operation](input),
    ])
  ),
  ...Object.fromEntries(
    ['start', 'status', 'stop'].map((operation) => [
      `plan-${operation}`,
      (store, input, ctx) => planningService(store, ctx)[operation](input),
    ])
  ),
  ...Object.fromEntries(
    ['start', 'status', 'stop', 'evidence'].map((operation) => [
      `linkedin-${operation}`,
      (store, input, ctx) => linkedinService(store, ctx)[operation](input),
    ])
  ),
  ...Object.fromEntries(
    ['stage', 'stored', 'review'].map((operation) => [
      `linkedin-position-${operation}`,
      (store, input, ctx) =>
        createLinkedinPositionReviews(positionOptions(store, ctx))[operation](
          input
        ),
    ])
  ),
  ...Object.fromEntries(
    ['start', 'status', 'stop', 'decide'].map((operation) => [
      `linkedin-position-${operation}`,
      (store, input, ctx) => positionJobs(store, ctx)[operation](input),
    ])
  ),
  ...Object.fromEntries(
    ['start', 'status', 'stop', 'decide'].map((operation) => [
      `linkedin-about-${operation}`,
      (store, input, ctx) => linkedinAboutJobs(store, ctx)[operation](input),
    ])
  ),
};
const admission = (req, operation, ctx) => {
  const read = [
    'stored',
    'document',
    'auto-status',
    'review-status',
    'hh-status',
    'hh-workplace-status',
    'hh-about-status',
    'linkedin-status',
    'linkedin-evidence',
    'linkedin-position-stored',
    'linkedin-position-status',
    'linkedin-about-status',
    'plan-status',
    'report-preview',
    'report-status',
  ].includes(operation);
  if (req.method !== (read ? 'GET' : 'POST')) {
    return { status: 405, code: 'method-not-allowed' };
  }
  if (!read && !isTrustedMutation(req, ctx.allowOrigins)) {
    return { status: 403, code: 'forbidden' };
  }
};
/** Local snapshot import is separate from provider editing and public publication. */
export const handleCvExperienceRoutes = async (
  store,
  req,
  res,
  route,
  url,
  ctx
) => {
  const operation = route.slice('/api/cv/experience/'.length);
  if (
    !route.startsWith('/api/cv/experience/') ||
    !Object.hasOwn(actions, operation)
  ) {
    return false;
  }
  res.setHeader('cache-control', 'private, no-store');
  const refused = admission(req, operation, ctx);
  if (refused) {
    return json(res, refused.status, { code: refused.code }) ?? true;
  }
  try {
    const input =
      req.method === 'GET'
        ? Object.fromEntries(url.searchParams)
        : await readBody(req, { limit: 4 * 1024 * 1024 });
    const result = await actions[operation](store, input, ctx);
    return json(res, 200, result) ?? true;
  } catch (error) {
    return (
      json(res, error.status ?? 400, {
        code: error.code ?? 'cv-experience-document',
        error:
          'The experience snapshot operation did not complete. Stored snapshots are retained.',
      }) ?? true
    );
  }
};
