import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { resumeExportRequestId } from '../jobs/resume-export-options.js';
import { resumeExportId } from '../jobs/resume-export-result.js';
import {
  storedResumeExport,
  storedResumeExports,
} from '../jobs/resume-export-files.js';
import {
  chooseSearchResume,
  resumeHash,
  resumeList,
  resumeListId,
} from '../jobs/resume-list.js';
import { PrivateCvJob } from './private-job.js';
import { experienceFromHhExport } from './experience-hh.js';
import {
  hhAcquisitionFailure as failure,
  hhAcquisitionOptions,
} from './experience-hh-acquisition-options.js';

const key = (id) => `secret:cv-hh-acquisition:${resumeExportRequestId(id)}`;
export const hhAcquisitionRunning = (row) =>
  ['checking-cache', 'exporting'].includes(row.phase);

const newRecord = (requestId, options = null) => ({
  id: key(requestId),
  version: 1,
  requestId,
  options,
  phase: options ? 'checking-cache' : 'stopped',
  result: null,
  code: options ? null : 'cv-hh-acquisition-stopped',
});

const checkResult = (result, options) => {
  if (
    !result ||
    !options ||
    !/^[a-f0-9]{64}$/u.test(result.revision ?? '') ||
    !['cached', 'native'].includes(result.source) ||
    (options.refresh && result.source !== 'native') ||
    result.browserSlot !== options.browserSlot ||
    (options.hash && result.hash !== options.hash)
  ) {
    throw failure('record');
  }
  return {
    revision: result.revision,
    source: result.source,
    exportId: resumeExportId(result.exportId),
    hash: resumeHash(result.hash),
    browserSlot: result.browserSlot,
  };
};

const checked = (row, id) => {
  if (!row) {
    throw failure('missing');
  }
  if (
    row.id !== key(id) ||
    row.version !== 1 ||
    row.requestId !== id ||
    !['checking-cache', 'exporting', 'completed', 'failed', 'stopped'].includes(
      row.phase
    ) ||
    (!row.options && row.phase !== 'stopped') ||
    (row.options &&
      (row.options.requestId !== id ||
        JSON.stringify(hhAcquisitionOptions(row.options)) !==
          JSON.stringify(row.options))) ||
    (row.phase === 'completed') !== (row.result !== null) ||
    (row.code !== null &&
      !/^(?:cv-hh-acquisition|jobs|assignment)-[a-z\d-]+$/u.test(row.code))
  ) {
    throw failure('record');
  }
  return {
    ...newRecord(id, row.options),
    phase: row.phase,
    result: row.result === null ? null : checkResult(row.result, row.options),
    code: row.code,
  };
};

const view = ({ id: _id, version: _version, ...row }, active) => {
  if (hhAcquisitionRunning(row) && !active) {
    return {
      ...row,
      phase: active === null ? 'unknown' : 'interrupted',
      lastPhase: row.phase,
      code:
        active === null
          ? 'cv-hh-acquisition-ownership-unverified'
          : 'cv-hh-acquisition-interrupted',
    };
  }
  return row;
};
export const storedHhAcquisitionStatus = async (store, { requestId }) =>
  view(checked(await store.get(key(requestId)), requestId), null);

const cachedExport = async (store, { hash, browserSlot }) => {
  if (hash) {
    return storedResumeExport(store, browserSlot, hash);
  }
  const listKey = resumeListId(browserSlot);
  const storedList = await store.get(listKey);
  if (storedList) {
    if (storedList.id !== listKey || storedList.version !== 1) {
      throw failure('cache-invalid');
    }
    const selected = chooseSearchResume(resumeList(storedList, browserSlot), {
      resumeLanguage: 'any',
    });
    return selected.hash
      ? storedResumeExport(store, browserSlot, selected.hash)
      : null;
  }
  const { exports } = await storedResumeExports(store, browserSlot);
  if (exports.length <= 1) {
    return exports[0] ?? null;
  }
  const [first, second] = exports.sort((a, b) => b.updatedAt - a.updatedAt);
  return exports.length < 100 &&
    exports.every((row) => row.updatedAt !== null) &&
    first.updatedAt > second.updatedAt
    ? first
    : null;
};

const waitForNativeExport = async (vacancies, options, signal, wait) => {
  const requestId = `cv-hh-${createHash('sha256').update(options.requestId).digest('hex')}`;
  const request = { requestId };
  try {
    signal.throwIfAborted();
    let job = await vacancies['resume-export']({
      ...request,
      browserSlot: options.browserSlot,
      ...(options.hash && { resume: options.hash }),
      ...(options.headless === undefined ? {} : { headless: options.headless }),
      formats: ['html'],
    });
    while (job.state === 'running') {
      await wait(signal);
      job = await vacancies['resume-export-status'](request);
    }
    signal.throwIfAborted();
    const [result] = job.results;
    if (
      job.requestId !== requestId ||
      job.state !== 'completed' ||
      job.results.length !== 1 ||
      result.browserSlot !== options.browserSlot ||
      (options.hash && result.hash !== options.hash)
    ) {
      throw Object.assign(failure('native'), {
        code: job.code ?? failure('native').code,
      });
    }
    return result;
  } catch (error) {
    // A read failure follows the same ownership drain as Stop. The export is never replayed.
    await vacancies['resume-export-cancel'](request).catch(() => {});
    throw error;
  }
};

const convertedSnapshot = async (context, options, receipt) => {
  const { revision, provenance } = await experienceFromHhExport(context, {
    exportId: receipt.exportId,
    hash: receipt.hash,
    browserSlot: options.browserSlot,
  });
  const { exportId, hash, browserSlot } = provenance.identity;
  return { revision, exportId, hash, browserSlot };
};
const cachedSnapshot = async (context, options) => {
  const receipt = await cachedExport(context.store, options);
  if (!receipt) {
    return null;
  }
  return convertedSnapshot(context, options, receipt).catch((error) => {
    if (error.code === 'jobs-export-file-missing') {
      return null;
    }
    throw error;
  });
};

export const createHhExperienceAcquisition = ({
  store,
  artifactRoot,
  getVacancies,
  wait = (signal) => delay(250, null, { signal }),
}) =>
  new PrivateCvJob({
    store,
    failure,
    key,
    optionsFor: hhAcquisitionOptions,
    checked,
    view,
    newRecord,
    work: async ({ row, controller: { signal } }, save) => {
      const { options } = row;
      const context = { store, artifactRoot, signal };
      try {
        const cached = options.refresh
          ? null
          : await cachedSnapshot(context, options);
        let snapshot = cached;
        if (!cached) {
          signal.throwIfAborted();
          await save({ phase: 'exporting' });
          const receipt = await waitForNativeExport(
            getVacancies(),
            options,
            signal,
            wait
          );
          snapshot = await convertedSnapshot(context, options, receipt);
        }
        await save({
          phase: 'completed',
          result: {
            ...snapshot,
            source: cached ? 'cached' : 'native',
          },
        });
      } catch (error) {
        const code = signal.aborted ? failure('stopped').code : error.code;
        await save({
          phase: signal.aborted ? 'stopped' : 'failed',
          code: /^(?:cv-hh-acquisition|jobs|assignment)-[a-z\d-]+$/u.test(
            code ?? ''
          )
            ? code
            : failure('unavailable').code,
        });
      }
    },
  }).controls();
