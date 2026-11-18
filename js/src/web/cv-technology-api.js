import { confirmedCvTechnologyReview } from '../jobs/cv-technology-result.js';

export const createCvTechnologyApi = ({ get, report, local }) => ({
  vacancyCvTechnologyReview: async (input) =>
    confirmedCvTechnologyReview(
      await report('/api/vacancies/technology-review', input, {
        network: true,
        read: false,
      }),
      input
    ),
  vacancyCvTechnologyReviewSave: async (input) =>
    confirmedCvTechnologyReview(
      await report('/api/vacancies/technology-review-save', input, {
        network: true,
        read: false,
      }),
      input
    ),
  vacancyCvTechnologyReviewStored: async ({ browserSlot }) => {
    const value = await get(
      `/api/vacancies/technology-review-stored?${new URLSearchParams({ browserSlot })}`
    );
    return confirmedCvTechnologyReview(
      value ?? {
        review:
          (
            await (
              await local()
            ).get(`jobs-cv-technology-review:${browserSlot}`)
          )?.review ?? null,
      },
      { browserSlot }
    );
  },
});
