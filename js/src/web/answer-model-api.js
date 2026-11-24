import {
  normalizeAnswerModel,
  answerModelFailure,
} from '../automation/answer-model-config.js';

const checkResponse = (result) => {
  if (
    !result ||
    result.error ||
    result.ok === false ||
    result.status === 'failed'
  ) {
    throw answerModelFailure(
      result?.code ?? 'answer-model-unconfirmed',
      result?.error ?? 'Draft model settings were not confirmed.'
    );
  }
};
const confirmed = (result, input) => {
  checkResponse(result);
  const settings = result.settings;
  if (
    !settings ||
    !(
      settings.revision === null ||
      /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/u.test(settings.revision)
    )
  ) {
    throw answerModelFailure(
      'answer-model-unconfirmed',
      'Draft model revision was not confirmed.'
    );
  }
  const normalized = normalizeAnswerModel(settings);
  if (
    input &&
    (settings.revision === null ||
      settings.revision === input.revision ||
      settings.ok !== true ||
      JSON.stringify(normalized) !==
        JSON.stringify(normalizeAnswerModel(input)))
  ) {
    throw answerModelFailure(
      'answer-model-unconfirmed',
      'Draft model save was not confirmed.'
    );
  }
  return {
    ...result,
    settings: { ...normalized, revision: settings.revision },
  };
};

export const answerModelApi = ({ remote }) => ({
  answerModel: async () =>
    confirmed(await remote.get('/api/automations/answers/model')),
  saveAnswerModel: async (input) =>
    confirmed(
      await (remote.report ?? remote.post)(
        '/api/automations/answers/model',
        input,
        { network: true, read: false }
      ),
      input
    ),
});
