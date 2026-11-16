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
};
const admission = (req, operation, ctx) => {
  const read = ['stored', 'document'].includes(operation);
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
