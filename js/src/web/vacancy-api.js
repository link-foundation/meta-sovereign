/** Read-only server browser operations; cached records remain useful offline. */
import { vacancyContent } from '../assignments/vacancy-content.js';
import { assignmentVacancyUrl } from '../assignments/validation.js';
import { hhSearchUrl, jobsFailure } from '../jobs/options.js';
import { validateVacancySearch } from '../jobs/search-result.js';
import {
  resumeList,
  chooseSearchResume,
  resumeHash,
} from '../jobs/resume-list.js';
import { storedResumeLists } from '../jobs/resume-cache.js';
import { resumeExportJob } from '../jobs/resume-export-control.js';
import {
  resumeExportResult,
  resumeExportId,
  invalidResumeExport,
} from '../jobs/resume-export-result.js';
import {
  resumeExportOptions,
  resumeExportRequestId,
} from '../jobs/resume-export-options.js';
import { createTechnologyApi } from './technology-api.js';
import { createCvTechnologyApi } from './cv-technology-api.js';
import { createCvWatchApi } from './cv-watch-api.js';
import { createCvPrepareApi } from './cv-prepare-api.js';
import { createCvTranslationApi } from './cv-translation-api.js';
import { createCvWorkplaceApi } from './cv-workplace-api.js';
import { createVacancyChoiceApi } from './vacancy-choice-api.js';

const confirmedResumes = (answer, input) => {
  const list = resumeList(answer, input.browserSlot ?? 'jobs');
  const choice = chooseSearchResume(list, input);
  if (
    !Object.entries(choice).every(
      ([key, value]) => answer.selection?.[key] === value
    )
  ) {
    throw jobsFailure(
      'unconfirmed',
      'The requested resume selection was not confirmed.'
    );
  }
  return { ...list, selection: choice };
};
const confirmed = (operation, answer, input) => {
  if (answer.ok === false) {
    return answer;
  }
  if (operation === 'resumes') {
    return confirmedResumes(answer, input);
  }
  if (operation === 'cancel') {
    if (answer.stopped !== true) {
      throw jobsFailure(
        'unconfirmed',
        'Stopping the vacancy read was not confirmed.'
      );
    }
    return { stopped: true };
  }
  if (operation === 'collect') {
    return {
      id: answer.id,
      ...vacancyContent(answer, assignmentVacancyUrl(input.url)),
    };
  }
  const url = hhSearchUrl(input);
  const page = input.page ?? 0;
  if (
    answer.page !== page ||
    (answer.nextPage !== null && answer.nextPage !== page + 1) ||
    typeof answer.capturedAt !== 'string' ||
    !Number.isFinite(Date.parse(answer.capturedAt))
  ) {
    throw jobsFailure('unconfirmed', 'The requested search was not confirmed.');
  }
  const next = new URL(url);
  next.searchParams.set('page', String(page + 1));
  const result = validateVacancySearch(
    {
      ...answer,
      next: answer.nextPage === null ? null : next.href,
      empty: answer.cards?.length === 0,
    },
    url
  );
  return { ...result, capturedAt: answer.capturedAt };
};
const savedResumes = (answer) => {
  if (!Array.isArray(answer?.lists) || answer.lists.length > 100) {
    throw jobsFailure(
      'unconfirmed',
      'The saved resume lists were not confirmed.'
    );
  }
  return { lists: answer.lists.map((row) => resumeList(row)) };
};
const confirmedExport = (result, requestId) => {
  if (!result?.state && (result?.code || result?.ok === false)) {
    throw jobsFailure('export-unconfirmed', result.code ?? 'server-required');
  }
  const job = resumeExportJob(result);
  if (job.requestId !== requestId) {
    invalidResumeExport();
  }
  return job;
};
export const createVacancyApi = ({ get, report, local, fileUrl }) => ({
  ...createVacancyChoiceApi({ get, report, local }),
  ...createTechnologyApi({ get, report, local }),
  ...createCvTechnologyApi({ get, report, local }),
  ...createCvWatchApi({ get, report, local }),
  ...createCvPrepareApi({ get, report, local }),
  ...createCvTranslationApi({ get, report, local }),
  ...createCvWorkplaceApi({ get, report, local }),
  vacancyCapabilities: async () =>
    (await get('/api/vacancies/capabilities')) ?? {
      available: false,
      search: false,
      collect: false,
      resumes: false,
      resumeExport: false,
      apply: false,
      cached: true,
      localChoices: false,
      reason: 'server-required',
    },
  vacancyResumesStored: async () =>
    savedResumes(
      (await get('/api/vacancies/resumes-stored')) ??
        (await storedResumeLists(async (predicate) =>
          (await local()).query(predicate)
        ))
    ),
  vacancyStored: async () =>
    (await get('/api/vacancies/stored')) ?? {
      entries: (
        await (
          await local()
        ).query((row) => row.id?.startsWith('assignment-vacancy:'))
      )
        .slice(0, 100)
        .map((row) => ({ id: row.id, ...vacancyContent(row) })),
    },
  vacancyResumeExport: async (input) => {
    resumeExportOptions(input);
    const requestId = resumeExportRequestId(input.requestId);
    const result = await report('/api/vacancies/resume-export', input, {
      network: true,
      read: false,
    });
    return confirmedExport(result, requestId);
  },
  vacancyResumeExportStatus: async ({ requestId }) => {
    resumeExportRequestId(requestId);
    return confirmedExport(
      await get(
        `/api/vacancies/resume-export-status?requestId=${encodeURIComponent(requestId)}`
      ),
      requestId
    );
  },
  vacancyResumeExportCancel: async ({ requestId }) => {
    resumeExportRequestId(requestId);
    return confirmedExport(
      await report(
        '/api/vacancies/resume-export-cancel',
        { requestId },
        { network: true, read: false }
      ),
      requestId
    );
  },
  vacancyResumeExportsStored: async () => {
    const result = (await get('/api/vacancies/resume-exports-stored')) ?? {
      exports: (
        await (
          await local()
        ).query((row) => row.id?.startsWith('jobs-resume-export:'))
      ).slice(0, 100),
    };
    if (!Array.isArray(result.exports) || result.exports.length > 100) {
      invalidResumeExport();
    }
    return { exports: result.exports.map(resumeExportResult) };
  },
  vacancyResumeExportUrl: async ({ exportId, hash, name }) => {
    const query = new URLSearchParams({
      exportId: resumeExportId(exportId),
      hash: resumeHash(hash),
      name,
    });
    if (!/^resume\.(?:pdf|doc|rtf|html|md|txt|json|lino)$/u.test(name)) {
      invalidResumeExport();
    }
    return fileUrl?.(`/api/vacancies/resume-export-file?${query}`) ?? null;
  },
  ...Object.fromEntries(
    ['search', 'collect', 'cancel', 'resumes'].map((operation) => [
      `vacancy${operation[0].toUpperCase()}${operation.slice(1)}`,
      async (input = {}) =>
        confirmed(
          operation,
          (await report(`/api/vacancies/${operation}`, input, {
            network: true,
          })) ?? { ok: false, code: 'server-required' },
          input
        ),
    ])
  ),
});
