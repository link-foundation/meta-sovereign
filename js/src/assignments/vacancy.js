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

export const vacancySnapshot = async (
  store,
  readVacancy,
  url,
  refresh,
  signal,
  browserOptions = {}
) => {
  const id = `assignment-vacancy:${await modelFingerprint(url)}`;
  let saved = await store.get(id);
  if (saved && (saved.version !== 1 || saved.id !== id || saved.url !== url)) {
    throw assignmentFailure(
      'vacancy-invalid',
      'The saved vacancy snapshot is invalid.'
    );
  }
  if (!saved || refresh === true) {
    const snapshot = await readVacancy(url, { ...browserOptions, signal });
    signal?.throwIfAborted();
    const content = vacancyContent(snapshot, url);
    saved = {
      id,
      version: 1,
      tokens: ['assignment', 'vacancy'],
      children: [],
      ...content,
    };
    await store.put(saved);
    await store.flush?.();
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
