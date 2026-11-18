import { modelFingerprint } from '../automation/answer-model-context.js';
import {
  assignmentFailure,
  assignmentVacancy,
  assignmentVacancyUrl,
} from './validation.js';
import {
  rememberAssignmentVacancy,
  storedAssignmentVacancy,
} from './vacancy-association.js';
import { vacancyContent } from './vacancy-content.js';
import { saveAcknowledgedRecord } from '../storage/acknowledged-record.js';
import { ensureLegacyVacancies } from './vacancy-legacy-cache.js';
import { observedVacancyHistory } from './vacancy-history.js';
import {
  runVacancy,
  forgetRunVacancy,
  rememberRunVacancy,
} from './vacancy-run-context.js';

const checkSavedIdentity = (saved, id, url) => {
  if (saved && (saved.version !== 1 || saved.id !== id || saved.url !== url)) {
    throw assignmentFailure(
      'vacancy-invalid',
      'The saved vacancy snapshot is invalid.'
    );
  }
};

export const vacancySnapshot = async (
  store,
  readVacancy,
  url,
  refresh,
  signal,
  browserOptions = {}
) =>
  ownedVacancySnapshot({
    store,
    readVacancy,
    url,
    refresh,
    signal,
    browserOptions,
    owner: store,
  });

const prepareCache = async (store, collect) => {
  if (collect) {
    await ensureLegacyVacancies(store);
  }
};
const retainSnapshot = async (store, owner, saved, collect) => {
  if (collect) {
    await saveAcknowledgedRecord(store, saved);
    // An explicitly acknowledged collection supersedes an older RAM context.
    forgetRunVacancy(store, saved.url);
  } else {
    rememberRunVacancy(store, owner, saved);
  }
};

/** The caller owns temporary context until its worker has drained. */
export const ownedVacancySnapshot = async ({
  store,
  readVacancy,
  url,
  refresh,
  signal,
  browserOptions,
  owner,
}) => {
  signal?.throwIfAborted();
  const temporary = runVacancy(store, url);
  if (temporary && refresh !== true) {
    return temporary;
  }
  const collect = browserOptions.collectVacancies !== false;
  await prepareCache(store, collect);
  signal?.throwIfAborted();
  const id = `assignment-vacancy:${await modelFingerprint(url)}`;
  let saved = await store.get(id);
  checkSavedIdentity(saved, id, url);
  if (!saved || refresh === true) {
    if (saved) {
      vacancyContent(saved, url);
    }
    const snapshot = await readVacancy(url, { ...browserOptions, signal });
    signal?.throwIfAborted();
    const {
      status: _status,
      appliedAt: _appliedAt,
      ...content
    } = vacancyContent(snapshot, url);
    saved = {
      id,
      version: 1,
      tokens: ['assignment', 'vacancy'],
      children: [],
      ...content,
      ...observedVacancyHistory(saved, content),
      // A description refresh cannot erase or manufacture delivery evidence.
      status: saved?.status ?? 'encountered',
      ...(saved?.appliedAt ? { appliedAt: saved.appliedAt } : {}),
    };
    await retainSnapshot(store, owner, saved, collect);
  }
  vacancyContent(saved, url);
  return saved;
};

export const resolveAssignmentVacancy = async (
  { store, readVacancy, signal },
  input,
  inspection
) => {
  if (
    input.refreshVacancy !== undefined &&
    typeof input.refreshVacancy !== 'boolean'
  ) {
    throw assignmentFailure('input', 'refreshVacancy must be a boolean.');
  }
  if (input.vacancy !== undefined && input.vacancyUrl !== undefined) {
    throw assignmentFailure(
      'input',
      'Choose a vacancy URL or an explicit vacancy snapshot.'
    );
  }
  if (input.vacancy !== undefined) {
    return { vacancy: assignmentVacancy(input.vacancy), source: 'provided' };
  }
  const previous = input.vacancyUrl
    ? null
    : await storedAssignmentVacancy(store, inspection.url);
  const associated = input.vacancyUrl
    ? null
    : ((await rememberAssignmentVacancy(
        store,
        previous?.aliases ?? [inspection.url]
      )) ?? previous);
  const value = input.vacancyUrl ?? associated?.vacancyUrl;
  if (!value) {
    return { vacancy: assignmentVacancy(), source: 'unknown' };
  }
  const url = assignmentVacancyUrl(value);
  const saved = await vacancySnapshot(
    store,
    readVacancy,
    url,
    input.refreshVacancy,
    signal
  );
  return {
    vacancy: assignmentVacancy(saved),
    source: associated ? 'chat' : 'url',
    url,
    capturedAt: saved.capturedAt,
  };
};
