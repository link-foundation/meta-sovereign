import {
  listAnswerRules,
  answerRuleId,
  saveAnswerRule,
  deleteAnswerRule,
  previewAnswer,
  learnSavedAnswers,
} from '../automation/question-store.js';
import { normalizeAnswerRule } from '../automation/question-answers.js';
import {
  readAnswerPolicy,
  saveAnswerPolicy,
} from '../automation/question-policy.js';
import { salaryExchange } from '../automation/salary-exchange.js';
import {
  extractAnswerProfile,
  listAnswerProfileSources,
} from '../automation/question-profile-source.js';
import { questionProfilesApi } from './question-profiles-api.js';
import { answerModelApi } from './answer-model-api.js';

const validProfileCandidate = (candidate) =>
  typeof candidate?.value === 'string' &&
  Array.isArray(candidate.evidence) &&
  candidate.evidence.every(
    (entry) =>
      typeof entry?.source === 'string' && typeof entry.path === 'string'
  );
const validProfileField = (field) =>
  typeof field?.key === 'string' &&
  Array.isArray(field.candidates) &&
  field.candidates.every(validProfileCandidate);

const checkAnswerResponse = (result) => {
  if (
    !result ||
    typeof result !== 'object' ||
    Array.isArray(result) ||
    result.error ||
    result.status === 'failed' ||
    result.ok === false ||
    result.httpStatus >= 400
  ) {
    throw Object.assign(
      new Error(result?.error ?? 'Answer operation was not confirmed.'),
      { code: result?.code ?? 'answer-unconfirmed' }
    );
  }
};

const confirmedRule = (result, input) => {
  let rule;
  try {
    rule = normalizeAnswerRule(result?.rule);
  } catch {
    throw new Error('Answer rule save was not confirmed.');
  }
  const expected = normalizeAnswerRule({
    ...input,
    id: answerRuleId(input.id),
  });
  if (
    rule.id !== expected.id ||
    (input.contract !== true &&
      JSON.stringify(rule) !== JSON.stringify(expected))
  ) {
    throw new Error('Answer rule save was not confirmed.');
  }
  return { ...result, rule };
};

export const questionApi = ({ remote, store }) => {
  const call = async (action, input, fallback, read = false) => {
    const result = await (remote.report ?? remote.post)(
      `/api/automations/answers/${action}`,
      input,
      { network: true, read }
    );
    const answer = result ?? (await fallback());
    checkAnswerResponse(answer);
    return answer;
  };
  return {
    ...questionProfilesApi({ remote, store }),
    ...answerModelApi({ remote }),
    answerProfileSources: async () => {
      const result = await remote.get(
        '/api/automations/answers/profile-sources'
      );
      if (result?.error) {
        throw new Error(result.error);
      }
      if (result && !Array.isArray(result.sources)) {
        throw new Error('invalid profile source response');
      }
      return result ?? listAnswerProfileSources(store);
    },
    extractAnswerProfile: async (input = {}) => {
      const result = await call(
        'profile',
        input,
        () => extractAnswerProfile(store, input),
        true
      );
      if (
        result?.readOnly !== true ||
        result.requiresReview !== true ||
        !Array.isArray(result.fields) ||
        !result.fields.every(validProfileField) ||
        !Array.isArray(result.skipped) ||
        !result.profile ||
        typeof result.profile !== 'object' ||
        Array.isArray(result.profile)
      ) {
        throw new Error('invalid profile extraction response');
      }
      return result;
    },
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
    answerRules: async () => {
      const result = await remote.get('/api/automations/answers');
      if (result === null || result === undefined) {
        return listAnswerRules(store);
      }
      checkAnswerResponse(result);
      if (!Array.isArray(result.rules) || result.rules.length > 1000) {
        throw new Error('Answer rule list was not confirmed.');
      }
      return result.rules.map(normalizeAnswerRule);
    },
    saveAnswerRule: async (rule) =>
      confirmedRule(
        await call('save', { rule }, async () => ({
          rule: await saveAnswerRule(store, rule),
        })),
        rule
      ),
    deleteAnswerRule: async (id) => {
      const result = await call('delete', { id }, () =>
        deleteAnswerRule(store, id)
      );
      if (result.deleted !== answerRuleId(id)) {
        throw new Error('Answer rule deletion was not confirmed.');
      }
      return result;
    },
    previewAnswer: async (input) =>
      call('plan', input, () => previewAnswer(store, input), !input.modelDraft),
    learnAnswers: async (input = {}) =>
      call(
        'learn',
        input,
        () => learnSavedAnswers(store, input),
        input.apply !== true
      ),
  };
};
