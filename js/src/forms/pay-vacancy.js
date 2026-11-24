import { currentFormVacancy } from '../assignments/vacancy-association.js';
import {
  currentVacancySnapshot,
  vacancySnapshot,
} from '../assignments/vacancy.js';
import { createAssignmentVacancyReader } from '../assignments/vacancy-reader.js';

/** Bind a form to the current chat evidence before reading its public vacancy. */
export const resolveFormPayVacancy = async (
  store,
  formUrl,
  { readVacancy = createAssignmentVacancyReader({ store }), frozen, signal }
) => {
  let association;
  try {
    signal?.throwIfAborted();
    association = await currentFormVacancy(store, formUrl);
    if (!association) {
      return null;
    }
    const { vacancyUrl: url, sourceMessageId } = association;
    const saved = frozen
      ? await currentVacancySnapshot(store, url)
      : await vacancySnapshot(store, readVacancy, url, false, signal, {
          browserSlot: 'form-vacancy',
          useCase: 'forms',
        });
    return saved && saved.salary !== null
      ? {
          state: 'observed',
          url,
          sourceMessageId,
          capturedAt: saved.capturedAt,
          pay: saved.salary,
          evidence: `vacancy:hh:${new URL(url).pathname.split('/').at(-1)}`,
        }
      : { state: 'unavailable', url, sourceMessageId };
  } catch (error) {
    signal?.throwIfAborted();
    if (error.code === 'assignment-vacancy-ambiguous') {
      return { state: 'ambiguous' };
    }
    if (
      !error.code?.startsWith('assignment-vacancy-') &&
      !error.code?.startsWith('jobs-')
    ) {
      throw error;
    }
    return {
      state: 'unavailable',
      ...(association && {
        url: association.vacancyUrl,
        sourceMessageId: association.sourceMessageId,
      }),
    };
  }
};
