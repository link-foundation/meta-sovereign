import {
  confirmedCvWorkplacePlan,
  cvWorkplaceSourceShape,
  cvWorkplaceFail,
} from '../jobs/cv-workplace-plan.js';
import { storedCvWorkplacePlan } from '../jobs/cv-workplace-plan-storage.js';

const query = (input) =>
  new URLSearchParams(
    Object.entries(input).filter(([, value]) => value !== undefined)
  );
const dictionaryReply = (answer) => {
  for (const kind of ['areas', 'industries']) {
    for (const language of ['ru', 'en']) {
      const entries = answer?.[kind]?.[language];
      const idPattern =
        kind === 'areas' ? /^\d{1,12}$/u : /^\d{1,12}\.\d{1,12}$/u;
      if (
        !Array.isArray(entries) ||
        !entries.length ||
        entries.length > 20000 ||
        new Set(entries.map((entry) => entry?.id)).size !== entries.length ||
        entries.some(
          (entry) =>
            typeof entry?.id !== 'string' ||
            !idPattern.test(entry.id) ||
            typeof entry.name !== 'string' ||
            !entry.name.trim() ||
            entry.name.length > 500 ||
            typeof entry.parent !== 'string' ||
            entry.parent.length > 500
        )
      ) {
        cvWorkplaceFail('dictionary');
      }
    }
  }
  return answer;
};
const sourceReply = (answer, input) => {
  cvWorkplaceSourceShape(answer?.source);
  const { source, jobs } = answer;
  for (const field of ['exportId', 'hash', 'browserSlot']) {
    if (input[field] !== undefined && input[field] !== source.identity[field]) {
      cvWorkplaceFail('conflict');
    }
  }
  if (
    source.jobIndex !== (input.jobIndex ?? 0) ||
    !Array.isArray(jobs) ||
    jobs.length > 200 ||
    !jobs.length ||
    jobs.some(
      (job, index) =>
        job.index !== index ||
        ['company', 'position'].some(
          (field) =>
            typeof job[field] !== 'string' ||
            !job[field] ||
            job[field].length > 500
        )
    ) ||
    jobs[source.jobIndex]?.company !== source.job.company ||
    jobs[source.jobIndex]?.position !== source.job.position
  ) {
    cvWorkplaceFail();
  }
  return answer;
};
export const createCvWorkplaceApi = ({ get, report, local }) => ({
  vacancyCvWorkplaceSource: async (input) =>
    sourceReply(
      await get(`/api/vacancies/cv-workplace-source?${query(input)}`),
      input
    ),
  vacancyCvWorkplaceDictionaries: async () =>
    dictionaryReply(
      await report(
        '/api/vacancies/cv-workplace-dictionaries',
        {},
        { network: true, read: false }
      )
    ),
  vacancyCvWorkplacePlan: async (input) =>
    confirmedCvWorkplacePlan(
      await report('/api/vacancies/cv-workplace-plan', input, {
        network: true,
        read: false,
      }),
      input
    ),
  vacancyCvWorkplaceReview: async (input) =>
    confirmedCvWorkplacePlan(
      await report('/api/vacancies/cv-workplace-review', input, {
        network: true,
        read: false,
      }),
      { ...input, reviewing: true }
    ),
  vacancyCvWorkplacePlanStored: async (input) => {
    const answer = await get(
      `/api/vacancies/cv-workplace-plan-stored?${query(input)}`
    );
    return answer === null
      ? storedCvWorkplacePlan(await local(), input)
      : confirmedCvWorkplacePlan(answer, input);
  },
});
