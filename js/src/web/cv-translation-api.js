import {
  cvTranslationOptions,
  confirmedCvTranslation,
  cvTranslationFailure,
  fingerprintCvTranslation,
} from '../jobs/cv-translation-record.js';

export const createCvTranslationApi = ({ get, report, local }) => ({
  vacancyCvTranslate: async (input) => {
    const options = cvTranslationOptions(input);
    const answer = await confirmedCvTranslation(
      await report('/api/vacancies/cv-translate', options, {
        network: true,
        read: false,
      }),
      { requestId: options.requestId, browserSlot: options.browserSlot }
    );
    if (answer.cancelled) {
      return answer;
    }
    if (
      !answer.comparison ||
      JSON.stringify(answer.comparison.input) !== JSON.stringify(options)
    ) {
      throw cvTranslationFailure('receipt');
    }
    return answer;
  },
  vacancyCvTranslationCancel: async (input) =>
    confirmedCvTranslation(
      await report('/api/vacancies/cv-translation-cancel', input, {
        network: true,
        read: false,
      }),
      input
    ),
  vacancyCvTranslationStatus: async (input) => {
    const raw = await get(
      `/api/vacancies/cv-translation-status?${new URLSearchParams(input)}`
    );
    if (raw) {
      return confirmedCvTranslation(raw, input);
    }
    const store = await local();
    const id =
      input.requestId ??
      (await store.get(`jobs-cv-translation-latest:${input.browserSlot}`))
        ?.requestId;
    const row = id ? await store.get(`jobs-cv-translation:${id}`) : null;
    const answer = await confirmedCvTranslation(
      {
        comparison: row?.comparison ?? null,
        ...(row?.cancelled ? { cancelled: row.cancelled } : {}),
      },
      input
    );
    if (answer.comparison?.state === 'running') {
      const { fingerprint: _old, ...content } = answer.comparison;
      return {
        comparison: await fingerprintCvTranslation({
          ...content,
          state: 'interrupted',
        }),
      };
    }
    return answer;
  },
});
