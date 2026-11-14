import { realpath } from 'node:fs/promises';
import { browserName } from '../browser/policy.js';
import { acknowledgedRead, acknowledgedWrite } from './acknowledged-store.js';
import { saveTechnologyRecord } from './technology-storage.js';
import { resumeExportRequestId } from './resume-export-options.js';
import { cvPublicationFiles } from './cv-publication-source.js';
import {
  cvPublicationOptions,
  cvPublicationResult,
  cvPublicationFailure,
} from './cv-publication-record.js';
import {
  createCvPublicationGit,
  publicationDigest,
} from './cv-publication-git.js';

const recordId = (id) => `jobs-cv-publication:${resumeExportRequestId(id)}`;
const latestId = (slot) => `jobs-cv-publication-latest:${slot}`;
const trace = (state, count) => {
  if (globalThis.process?.env?.CI_CV_PUBLICATION_DEBUG === '1') {
    console.log('[cv-publication]', JSON.stringify({ state, count }));
  }
};
const frozen = (plan) => {
  const {
    state: _state,
    confirmation: _confirmation,
    commit: _commit,
    code: _code,
    ...rest
  } = cvPublicationResult(plan);
  return rest;
};
const checked = (raw, input) => {
  const plan = cvPublicationResult(raw, input);
  if (
    publicationDigest(JSON.stringify(frozen(plan))) !== plan.confirmation ||
    publicationDigest(plan.destination) !== plan.remoteFingerprint ||
    plan.files.some(
      (file) =>
        publicationDigest(file.content) !== file.sha256 ||
        Buffer.byteLength(file.content) !== file.bytes
    )
  ) {
    throw cvPublicationFailure();
  }
  return plan;
};

/** A durable attempt is never resumed by status, restart or a repeated request. */
export const createCvPublicationService = ({
  store,
  artifactRoot,
  run,
  git = createCvPublicationGit(),
  now = Date.now,
}) => {
  const filesFor = (options) =>
    cvPublicationFiles({ store, artifactRoot }, options);
  const save = async (plan) => {
    checked(plan);
    await saveTechnologyRecord(store, {
      id: recordId(plan.requestId),
      ...plan,
    });
    trace(plan.state, plan.files.length);
  };
  const read = async (input) => {
    const browserSlot = browserName(input.browserSlot ?? 'jobs');
    const requestId =
      input.requestId ?? (await store.get(latestId(browserSlot)))?.requestId;
    if (!requestId) {
      return { publication: null };
    }
    const raw = await store.get(recordId(requestId));
    if (!raw) {
      throw cvPublicationFailure();
    }
    const plan = checked(raw, { browserSlot, requestId });
    return {
      publication: ['attempting', 'committed'].includes(plan.state)
        ? {
            ...plan,
            state: 'uncertain',
            code: 'jobs-cv-publication-unverified',
          }
        : plan,
    };
  };
  return {
    'cv-publish-status': (input) => acknowledgedRead(store, () => read(input)),
    'cv-publish-plan': (input) =>
      acknowledgedWrite(store, run, async (signal) => {
        const options = cvPublicationOptions(input);
        try {
          options.repository = await realpath(options.repository);
        } catch {
          throw cvPublicationFailure();
        }
        const existing = await store.get(recordId(options.requestId));
        if (existing) {
          const plan = checked(existing, options);
          if (
            Object.keys(options).some(
              (key) =>
                JSON.stringify(options[key]) !== JSON.stringify(plan[key])
            )
          ) {
            throw cvPublicationFailure();
          }
          return read(options);
        }
        const files = await filesFor(options);
        const base = await git.preview(options, files, signal);
        const created = now();
        let plan = {
          ...options,
          ...base,
          version: 1,
          createdAt: new Date(created).toISOString(),
          expiresAt: new Date(created + 86400000).toISOString(),
          files,
          state: 'planned',
          confirmation: '0'.repeat(64),
          commit: null,
          code: null,
        };
        plan = {
          ...plan,
          confirmation: publicationDigest(JSON.stringify(frozen(plan))),
        };
        signal.throwIfAborted();
        await save(plan);
        await saveTechnologyRecord(store, {
          id: latestId(options.browserSlot),
          requestId: plan.requestId,
        });
        return { publication: plan };
      }),
    'cv-publish': (input) =>
      acknowledgedWrite(store, run, async (signal) => {
        const requestId = resumeExportRequestId(input.requestId);
        let plan = checked(await store.get(recordId(requestId)), input);
        if (
          input.publish !== true ||
          input.confirmation !== plan.confirmation
        ) {
          throw cvPublicationFailure();
        }
        if (plan.state !== 'planned') {
          return read(input);
        }
        if (
          now() >= Date.parse(plan.expiresAt) ||
          now() < Date.parse(plan.createdAt) ||
          JSON.stringify(await filesFor(plan)) !== JSON.stringify(plan.files)
        ) {
          throw cvPublicationFailure();
        }
        signal.throwIfAborted();
        plan = { ...plan, state: 'attempting' };
        await save(plan);
        try {
          const result = await git.publish(plan, {
            signal,
            committed: async (commit) => {
              plan = { ...plan, state: 'committed', commit };
              await save(plan);
            },
          });
          signal.throwIfAborted();
          plan = { ...plan, ...result };
          await save(plan);
        } catch {
          plan = {
            ...plan,
            state: 'uncertain',
            code: 'jobs-cv-publication-unverified',
          };
          await save(plan);
        }
        return { publication: plan };
      }),
  };
};
