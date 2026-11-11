// Shared persisted answer knowledge for the CLI, server and offline editor.
import { createBoundedHistory } from '../replies/bounded-history.js';
import { modelAnswerPreview } from './answer-model-preview.js';
import {
  prepareAnswerModelContext,
  modelFingerprint,
} from './answer-model-context.js';
import { chatQuestionTurn, chatAnswerAction } from './question-chat-turn.js';
import { historyOrder } from '../replies/history-order.js';
import {
  answerEnvironmentFromMessages,
  normalizeAnswerEnvironment,
} from './question-context.js';
import {
  normalizeAnswerRule,
  normalizeAnswerAction,
  QA_RULE_PREFIX,
  planAnswer,
} from './question-answers.js';
import { archiveReadGuard, learnArchivedAnswers } from './question-archive.js';
import { createAnswerContractor } from './question-contraction.js';
import { answerTemplateEnvironment } from './salary-template.js';
import { renderAnswer } from './question-profile.js';
import { readAnswerPolicy, rejectedAnswer } from './question-policy.js';
import { writeAnswerKnowledge } from './question-knowledge.js';
import {
  readAnswerProfile,
  resolveAnswerProfile,
  resolveStoredAnswerProfile,
} from './question-profiles.js';
import { debugQuestionTurn } from './question-turns.js';
import { mergeObservedAnswers } from './question-merge.js';
import {
  prepareSalaryExchange,
  withSalaryExchangeEvidence,
} from './salary-exchange-policy.js';

export const answerRuleId = (id) => {
  if (typeof id !== 'string' || !id.trim() || id.length > 480) {
    throw new Error('a nonempty answer rule identifier is required');
  }
  const key = id.startsWith(QA_RULE_PREFIX) ? id : `${QA_RULE_PREFIX}${id}`;
  if (!key.slice(QA_RULE_PREFIX.length).trim()) {
    throw new Error('a nonempty answer rule identifier is required');
  }
  return key;
};

const scan = async (store, select, consume, project = (link) => link) => {
  if (store.scan) {
    await store.scan(select, 256, consume, project);
  } else {
    const records = await store.query(select);
    for (let index = 0; index < records.length; index += 256) {
      await consume(
        records
          .slice(index, index + 256)
          .map(project)
          .filter(Boolean)
      );
    }
  }
};

const readAnswerRules = async (store, maxBytes = Infinity) => {
  const rules = [];
  let bytes = 0;
  await scan(
    store,
    (link) => link?.id?.startsWith(QA_RULE_PREFIX),
    (batch) => {
      for (const rule of batch) {
        if (rules.length >= 1000) {
          throw new Error('answer rule limit (1000) exceeded');
        }
        const normalized = normalizeAnswerRule(rule);
        if (Number.isFinite(maxBytes)) {
          bytes += JSON.stringify(normalized).length * 2;
          if (bytes > maxBytes) {
            throw new Error(
              'answer knowledge capacity exceeded; no proposals applied'
            );
          }
        }
        rules.push(normalized);
      }
    }
  );
  return rules.sort((a, b) => a.question.localeCompare(b.question));
};

export const listAnswerRules = (store) => readAnswerRules(store);

const contractionInput = async (store, input, resolved = false) => {
  if (input.contract !== true) {
    return input;
  }
  return {
    ...(resolved ? input : await resolveStoredAnswerProfile(store, input)),
    salary: (
      await prepareSalaryExchange(store, input.salary, {
        now: () => input.now ?? Date.now(),
      })
    ).salary,
  };
};

const writeAnswerRule = async (store, input) => {
  input = await contractionInput(store, input);
  const normalized = normalizeAnswerRule({
    ...input,
    id: answerRuleId(input?.id),
  });
  const contract = createAnswerContractor(input);
  const existing =
    input.contract === true ? await store.get(normalized.id) : null;
  const profile =
    input.contract === true
      ? answerTemplateEnvironment(normalized.question, input).profile
      : {};
  const rule = normalizeAnswerRule({
    ...normalized,
    answers: normalized.answers.map((answer) => {
      const original = existing?.answers?.find(
        (entry) => renderAnswer(entry.text, profile).text === answer.text
      );
      return { ...answer, text: original?.text ?? contract(answer.text) };
    }),
  });
  const policy = await readAnswerPolicy(store);
  if (
    [...normalized.answers, ...rule.answers].some(
      (answer) => answer.canonical && rejectedAnswer(answer.text, policy)
    )
  ) {
    throw new Error('canonical answer contains rejected content');
  }
  if (
    !(await store.get(rule.id)) &&
    (await listAnswerRules(store)).length >= 1000
  ) {
    throw new Error('answer rule limit (1000) exceeded');
  }
  await store.put(rule);
  return rule;
};

export const saveAnswerRule = (store, input) =>
  writeAnswerKnowledge(store, () => writeAnswerRule(store, input));

export const deleteAnswerRule = (store, id) =>
  writeAnswerKnowledge(store, async () => {
    const key = answerRuleId(id);
    await store.delete(key);
    return { deleted: key };
  });

// Read knowledge once when a bounded batch (such as a form) shares a context.
export const prepareAnswerPreview = async (
  store,
  input = {},
  { maxBytes = Infinity } = {}
) => {
  const rules = await readAnswerRules(store, maxBytes);
  const action = await resolveStoredAnswerProfile(
    store,
    normalizeAnswerAction(input)
  );
  const prepared = await prepareSalaryExchange(store, action.salary, {
    now: () => input.now ?? Date.now(),
  });
  const context = {
    ...input,
    ...action,
    salary: prepared.salary,
    ...normalizeAnswerEnvironment(input),
    policy: await readAnswerPolicy(store),
    rules: action.ruleIds.length
      ? rules.filter((rule) => action.ruleIds.includes(rule.id))
      : rules,
  };
  return { context, rateState: prepared.rateState };
};

export const previewAnswer = async (store, input, modelOptions = {}) => {
  if (typeof input.question !== 'string' || input.question.length > 6000) {
    throw new Error('question must be text of at most 6000 characters');
  }
  const prepared = await prepareAnswerPreview(
    store,
    input,
    input.modelDraft
      ? { maxBytes: 512 * 1024 }
      : input.matchPage !== undefined
        ? { maxBytes: 4 * 1024 ** 2 }
        : {}
  );
  return withSalaryExchangeEvidence(
    await modelAnswerPreview(
      store,
      input,
      planAnswer(input.question, prepared.context),
      prepared.context,
      modelOptions
    ),
    prepared.rateState
  );
};

const contextHistoryMessage = (message) => {
  const valid = typeof message.body === 'string' && message.body.length <= 6000;
  return {
    ...message,
    body: valid ? message.body : '',
    service: message.service || !valid,
  };
};

const sameQuestion = (latest, draft, selected) =>
  latest &&
  !latest.deleted &&
  !latest.service &&
  latest.id === draft.answer.message &&
  (draft.answer.turn
    ? selected.question === draft.answer.question &&
      JSON.stringify(selected.turn) === JSON.stringify(draft.answer.turn)
    : latest.body === draft.answer.question);

// Recheck the actual latest turn and current approvals immediately before an
// automatic send. A newer/edited question or changed rule invalidates a plan.
export const readChatAnswerInput = async (store, automation, draft) => {
  let latest;
  let unknownTime = false;
  const history = createBoundedHistory({
    maxMessages: 21,
    maxBytes: 300000,
    maxChars: 6000,
  });
  await scan(
    store,
    (link) =>
      link?.id?.startsWith('msg:') &&
      link.source === draft.source &&
      String(link.chat) === String(draft.chat),
    (batch) => {
      for (const message of batch) {
        const at = Date.parse(message.timestamp);
        if (!Number.isFinite(at)) {
          unknownTime = true;
        }
        history.add(contextHistoryMessage(message));
        if (!latest || historyOrder(message, latest) > 0) {
          latest = message;
        }
      }
    },
    (link) => ({
      id: link.id,
      source: link.source,
      chat: link.chat,
      pending: link.pending,
      failed: link.failed,
      delivery: link.delivery,
      status: link.status,
      answerContext: link.answerContext,
      body: link.body,
      timestamp: link.timestamp,
      deleted: link.deleted,
      service: link.service,
      answerOptions: link.answerOptions,
      sender: link.sender,
      out: link.out,
      outgoing: link.outgoing,
    })
  );
  const selected = chatQuestionTurn(
    history.values(),
    draft.answer.turn?.owners
  );
  if (
    unknownTime ||
    selected.reason ||
    !sameQuestion(latest, draft, selected)
  ) {
    return {
      ok: false,
      code: 'answer-changed',
      error:
        'The question changed; review the current conversation before sending',
    };
  }
  return {
    ok: true,
    input: {
      ...chatAnswerAction(automation.action),
      question: selected.question,
      ...answerEnvironmentFromMessages(history.values(), latest),
      source: draft.source,
      chat: String(draft.chat),
      options: latest.answerOptions,
    },
  };
};

const validateModelAnswer = async (store, current, draft, input) => {
  try {
    const { context } = await prepareAnswerPreview(store, input, {
      maxBytes: 512 * 1024,
    });
    const prepared = await prepareAnswerModelContext(store, context, [
      input.question,
    ]);
    if (
      prepared.fingerprint === draft.answer.model.fingerprint &&
      (await modelFingerprint(normalizeAnswerAction(current.action))) ===
        draft.answer.modelAction
    ) {
      return { ok: true };
    }
  } catch {
    // A deleted CV/profile or invalid current settings also invalidate the draft.
  }
  return {
    ok: false,
    code: 'answer-review-required',
    error: 'The model context changed; prepare a new answer before sending',
  };
};

export const validateAnswerDraft = async (
  store,
  automation,
  draft,
  { reviewed = false, now } = {}
) => {
  const turn = await readChatAnswerInput(store, automation, draft);
  if (!turn.ok) {
    return turn;
  }
  if (reviewed && !draft.answer.model?.used) {
    return { ok: true };
  }
  const saved = await store.get(automation.id);
  const current = saved ?? automation;
  if (
    (!saved && draft.answer.savedAutomation) ||
    current.enabled === false ||
    current.action?.kind !== 'answer-questions'
  ) {
    return {
      ok: false,
      code: 'answer-review-required',
      error: 'The question automation changed; review before sending',
    };
  }
  const input = { ...turn.input, ...chatAnswerAction(current.action), now };
  if (draft.answer.model?.used) {
    return validateModelAnswer(store, current, draft, input);
  }
  return validateCurrentAnswer(store, draft, input);
};

const validateCurrentAnswer = async (store, draft, input) => {
  let fresh;
  try {
    fresh = await previewAnswer(store, {
      ...input,
      modelDraft: false,
    });
  } catch (error) {
    if (error.code !== 'answer-profile-missing') {
      throw error;
    }
    return { ok: false, code: 'answer-review-required', error: error.message };
  }
  if (
    fresh.text !== draft.text ||
    !fresh.complete ||
    fresh.requiresReview ||
    JSON.stringify(fresh.profileSource) !==
      JSON.stringify(draft.answer.profileSource)
  ) {
    return {
      ok: false,
      code: 'answer-review-required',
      error: 'The saved answer changed or needs review before sending',
    };
  }
  return { ok: true };
};

const readAnswerKnowledge = async (store, profileId) => ({
  policy: await readAnswerPolicy(store),
  rules: await readAnswerRules(store, 8 * 1024 ** 2),
  ...(profileId ? { profile: await readAnswerProfile(store, profileId) } : {}),
});

const unchangedKnowledge = async (store, snapshot, checkArchive, profileId) => {
  checkArchive();
  const current = await readAnswerKnowledge(store, profileId);
  checkArchive();
  if (JSON.stringify(current) !== snapshot) {
    debugQuestionTurn('learning-invalidated', { kind: 'knowledge-snapshot' });
    throw new Error(
      'answer knowledge changed during learning; retry before applying'
    );
  }
};

// Learning produces reviewable proposals by default. Applying never grants
// approval and never increments frequencies merely because it ran again.
const collectSavedAnswers = async (
  store,
  { self = [], apply = false, ...options } = {},
  checkArchive
) => {
  if (!Array.isArray(self) || self.some((id) => typeof id !== 'string')) {
    throw new Error('self must be a list of identifiers');
  }
  const knowledge = await readAnswerKnowledge(store, options.profileId);
  const snapshot = JSON.stringify(knowledge);
  options = await contractionInput(
    store,
    resolveAnswerProfile(options, knowledge.profile),
    true
  );
  const saved = new Map(knowledge.rules.map((rule) => [rule.id, rule]));
  const learned = await learnArchivedAnswers(store, {
    self: [...new Set(['me', ...self])],
    policy: knowledge.policy,
    contract: createAnswerContractor(options),
    profile: options.profile,
    rules: knowledge.rules,
  });
  const rules = mergeObservedAnswers(
    saved,
    learned.rules,
    apply ? 1000 : Infinity
  );
  checkArchive();
  if (apply === true) {
    await writeAnswerKnowledge(store, async () => {
      await unchangedKnowledge(
        store,
        snapshot,
        checkArchive,
        options.profileId
      );
      for (const rule of rules) {
        await store.put(rule);
      }
    });
  } else {
    await unchangedKnowledge(store, snapshot, checkArchive, options.profileId);
  }
  return { rules, applied: apply === true, coverage: learned.coverage };
};

export const learnSavedAnswers = async (store, input = {}) => {
  const guard = archiveReadGuard(store);
  try {
    return await collectSavedAnswers(store, input, guard.check);
  } finally {
    guard.close();
  }
};
