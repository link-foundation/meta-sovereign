import {
  listAnswerRules,
  saveAnswerRule,
  deleteAnswerRule,
  previewAnswer,
  learnSavedAnswers,
} from '../automation/question-store.js';
import {
  readAnswerPolicy,
  saveAnswerPolicy,
} from '../automation/question-policy.js';
import { salaryExchange } from '../automation/salary-exchange.js';

export const questionApi = ({ remote, store }) => {
  const call = async (action, input, fallback, read = false) => {
    const result = await (remote.report ?? remote.post)(
      `/api/automations/answers/${action}`,
      input,
      { network: true, read }
    );
    if (result?.error || result?.status === 'failed') {
      throw Object.assign(new Error(result.error ?? result.code), {
        code: result.code,
      });
    }
    return result ?? fallback();
  };
  return {
    salaryExchange: async (input = {}) =>
      call(
        'exchange',
        input,
        () => salaryExchange(store, input),
        input.refresh !== true
      ),
    answerPolicy: async () =>
      (await remote.get('/api/automations/answers/policy'))?.policy ??
      readAnswerPolicy(store),
    saveAnswerPolicy: async (policy) =>
      call('policy', { policy }, async () => ({
        policy: await saveAnswerPolicy(store, policy),
      })),
    answerRules: async () =>
      (await remote.get('/api/automations/answers'))?.rules ??
      listAnswerRules(store),
    saveAnswerRule: async (rule) =>
      call('save', { rule }, async () => ({
        rule: await saveAnswerRule(store, rule),
      })),
    deleteAnswerRule: async (id) =>
      call('delete', { id }, () => deleteAnswerRule(store, id)),
    previewAnswer: async (input) =>
      call('plan', input, () => previewAnswer(store, input), true),
    learnAnswers: async (input = {}) =>
      call(
        'learn',
        input,
        () => learnSavedAnswers(store, input),
        input.apply !== true
      ),
  };
};
