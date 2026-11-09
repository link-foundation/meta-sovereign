// Shared persisted answer knowledge for the CLI, server and offline editor.
import { createBoundedHistory } from '../replies/bounded-history.js';
import {
  normalizeAnswerRule,
  normalizeAnswerAction,
  QA_RULE_PREFIX,
  planAnswer,
} from './question-answers.js';
import { learnAnswerRules } from './question-learning.js';
import { readAnswerPolicy, rejectedAnswer } from './question-policy.js';

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

export const listAnswerRules = async (store) => {
  const rules = [];
  await scan(
    store,
    (link) => link?.id?.startsWith(QA_RULE_PREFIX),
    (batch) => {
      for (const rule of batch) {
        if (rules.length >= 1000) {
          throw new Error('answer rule limit (1000) exceeded');
        }
        rules.push(normalizeAnswerRule(rule));
      }
    }
  );
  return rules.sort((a, b) => a.question.localeCompare(b.question));
};

export const saveAnswerRule = async (store, input) => {
  const rule = normalizeAnswerRule({ ...input, id: answerRuleId(input?.id) });
  const policy = await readAnswerPolicy(store);
  if (
    rule.answers.some(
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

export const deleteAnswerRule = async (store, id) => {
  const key = answerRuleId(id);
  await store.delete(key);
  return { deleted: key };
};

export const previewAnswer = async (store, input) => {
  if (typeof input.question !== 'string' || input.question.length > 6000) {
    throw new Error('question must be text of at most 6000 characters');
  }
  const rules = await listAnswerRules(store);
  const action = normalizeAnswerAction(input);
  return planAnswer(input.question, {
    ...input,
    ...action,
    policy: await readAnswerPolicy(store),
    rules: action.ruleIds.length
      ? rules.filter((rule) => action.ruleIds.includes(rule.id))
      : rules,
  });
};

// Recheck the actual latest turn and current approvals immediately before an
// automatic send. A newer/edited question or changed rule invalidates a plan.
export const validateAnswerDraft = async (
  store,
  automation,
  draft,
  { reviewed = false } = {}
) => {
  let latest;
  let unknownTime = false;
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
        if (!latest || at >= Date.parse(latest.timestamp)) {
          latest = message;
        }
      }
    },
    (link) => ({
      id: link.id,
      body: link.body,
      timestamp: link.timestamp,
      deleted: link.deleted,
      service: link.service,
      answerOptions: link.answerOptions,
    })
  );
  if (
    unknownTime ||
    !latest ||
    latest.deleted ||
    latest.service ||
    latest.id !== draft.answer.message ||
    latest.body !== draft.answer.question
  ) {
    return {
      ok: false,
      code: 'answer-changed',
      error:
        'The question changed; review the current conversation before sending',
    };
  }
  if (reviewed) {
    return { ok: true };
  }
  const fresh = await previewAnswer(store, {
    question: latest.body,
    ...automation.action,
    source: draft.source,
    chat: String(draft.chat),
    options: latest.answerOptions,
  });
  if (fresh.text !== draft.text || !fresh.complete || fresh.requiresReview) {
    return {
      ok: false,
      code: 'answer-review-required',
      error: 'The saved answer changed or needs review before sending',
    };
  }
  return { ok: true };
};

// Recent derived window, never a replacement for the durable archive. The
// response exposes coverage; truncated bodies remain turn barriers.
const learningHistory = async (store, self) => {
  const history = createBoundedHistory({ maxChars: 12000 });
  let seen = 0;
  await scan(
    store,
    (link) => link?.id?.startsWith('msg:'),
    (batch) => {
      for (const message of batch) {
        seen++;
        history.add(message);
      }
    },
    (link) => ({
      id: link.id,
      source: link.source,
      chat: link.chat,
      sender: link.sender,
      body:
        typeof link.body === 'string' && link.body.length <= 12000
          ? link.body
          : '',
      timestamp: link.timestamp,
      replyTo: link.replyTo,
      deleted: link.deleted,
      service:
        link.service ||
        typeof link.body !== 'string' ||
        link.body.length > 12000,
      pending: link.pending,
      failed: link.failed,
      delivery: link.delivery,
      status: link.status,
      out: link.out,
      outgoing: link.outgoing,
    })
  );
  const stats = history.stats();
  return {
    messages: history.values(),
    self: [...new Set(['me', ...self])],
    coverage: {
      seen,
      retained: stats.messages,
      limited: seen > stats.messages,
      maxMessages: stats.maxMessages,
      maxBytes: stats.maxBytes,
    },
  };
};

const mergeLearned = (existing, proposal) => ({
  ...proposal,
  ...existing,
  answers: [...(existing?.answers ?? [])],
});

// Learning produces reviewable proposals by default. Applying never grants
// approval and never increments frequencies merely because it ran again.
export const learnSavedAnswers = async (
  store,
  { self = [], apply = false } = {}
) => {
  if (!Array.isArray(self) || self.some((id) => typeof id !== 'string')) {
    throw new Error('self must be a list of identifiers');
  }
  const history = await learningHistory(store, self);
  const proposed = learnAnswerRules(history.messages, {
    self: history.self,
    policy: await readAnswerPolicy(store),
  });
  const rules = [];
  for (const proposal of proposed) {
    const existing = await store.get(proposal.id);
    const merged = mergeLearned(existing, proposal);
    for (const answer of proposal.answers) {
      const prior = merged.answers.find((entry) => entry.text === answer.text);
      if (prior) {
        const at = merged.answers.indexOf(prior);
        merged.answers[at] = {
          ...prior,
          count: Math.max(prior.count, answer.count),
          evidence: [...new Set([...prior.evidence, ...answer.evidence])].slice(
            0,
            100
          ),
        };
      } else if (merged.answers.length < 100) {
        merged.answers.push(answer);
      }
    }
    rules.push(normalizeAnswerRule(merged));
  }
  if (apply === true) {
    const existing = await listAnswerRules(store);
    if (new Set([...existing, ...rules].map((rule) => rule.id)).size > 1000) {
      throw new Error(
        'answer rule limit (1000) exceeded; no proposals applied'
      );
    }
    for (const rule of rules) {
      await store.put(rule);
    }
  }
  return { rules, applied: apply === true, coverage: history.coverage };
};
