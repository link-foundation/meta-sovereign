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
import { createLinkedinExperienceService } from '../cv/linkedin-experience-service.js';
import { createExperiencePlanningService } from '../cv/experience-plan-service.js';
import { createLinkedinPositionReviews } from '../cv/linkedin-position-review.js';
import {
  createFormalExperienceReports,
  previewFormalExperienceReport,
} from '../cv/formal-report-service.js';

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

const positionReviews = (store, ctx) =>
  createLinkedinPositionReviews({
    store,
    artifactRoot:
      ctx.cvExperienceOptions?.artifactRoot ??
      path.join(ctx.storeDir ?? defaultStoreDir(), 'experience-exports'),
  });

const actions = {
  stored: (store) => storedExperienceDocuments(store),
  document: (store, input) => storedExperienceDocument(store, input.revision),
  import: (store, input) => saveExperienceDocument(store, input.document),
  'from-hh': (store, input, ctx) =>
    experienceFromHhExport(
      {
        store,
        artifactRoot:
          ctx.vacancyOptions?.artifactRoot ??
          path.join(ctx.storeDir ?? defaultStoreDir(), 'resume-exports'),
      },
      input
    ),
  compare: (store, input) => compareStoredExperience(store, input),
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
      (store, input, ctx) => positionReviews(store, ctx)[operation](input),
    ])
  ),
};
const admission = (req, operation, ctx) => {
  const read = [
    'stored',
    'document',
    'linkedin-status',
    'linkedin-evidence',
    'linkedin-position-stored',
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
