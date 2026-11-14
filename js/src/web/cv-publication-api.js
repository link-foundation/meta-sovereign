import {
  cvPublicationOptions,
  cvPublicationResult,
} from '../jobs/cv-publication-record.js';
import { browserName } from '../browser/policy.js';
import { resumeExportRequestId } from '../jobs/resume-export-options.js';

const checked = (value, input) => ({
  publication: cvPublicationResult(value?.publication, input),
});
export const createCvPublicationApi = ({ get, report, local }) => ({
  vacancyCvPublishPlan: async (input) => {
    cvPublicationOptions(input);
    return checked(
      await report('/api/vacancies/cv-publish-plan', input, {
        network: true,
        read: false,
      }),
      input
    );
  },
  vacancyCvPublish: async (input) => {
    resumeExportRequestId(input.requestId);
    if (input.publish !== true || !/^[a-f\d]{64}$/u.test(input.confirmation)) {
      throw new Error('jobs-cv-publication-unverified');
    }
    return checked(
      await report('/api/vacancies/cv-publish', input, {
        network: true,
        read: false,
      }),
      input
    );
  },
  vacancyCvPublishStatus: async (input) => {
    const browserSlot = browserName(input.browserSlot ?? 'jobs');
    const value = await get(
      `/api/vacancies/cv-publish-status?${new URLSearchParams(input)}`
    );
    if (value) {
      return value.publication === null
        ? { publication: null }
        : checked(value, input);
    }
    const store = await local();
    const requestId =
      input.requestId ??
      (await store.get(`jobs-cv-publication-latest:${browserSlot}`))?.requestId;
    if (!requestId) {
      return { publication: null };
    }
    const result = checked(
      {
        publication: await store.get(
          `jobs-cv-publication:${resumeExportRequestId(requestId)}`
        ),
      },
      { browserSlot, requestId }
    );
    if (['attempting', 'committed'].includes(result.publication.state)) {
      result.publication = {
        ...result.publication,
        state: 'uncertain',
        code: 'jobs-cv-publication-unverified',
      };
    }
    return result;
  },
});
