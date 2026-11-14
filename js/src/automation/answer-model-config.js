import { writeAnswerKnowledge } from './question-knowledge.js';

export const ANSWER_MODEL_ID = 'config:answer-model';
const revisionPattern = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/u;
export const answerModelFailure = (code, message) =>
  Object.assign(new Error(message), { code });

const invalid = () => {
  throw answerModelFailure(
    'answer-model-config',
    'Invalid local draft model settings.'
  );
};
const validOptionalId = (value, pattern) =>
  typeof value === 'string' && (!value || pattern.test(value));
const validTimeout = (value) =>
  Number.isSafeInteger(value) && value >= 1000 && value <= 120000;
export const normalizeAnswerModel = (input = {}) => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    invalid();
  }
  const enabled = input.enabled ?? false;
  const model = input.model ?? '';
  const cvId = input.cvId ?? '';
  const timeoutMs = input.timeoutMs ?? 60000;
  if (
    (input.provider !== undefined && input.provider !== 'claude-code') ||
    typeof enabled !== 'boolean' ||
    !validOptionalId(model, /^[a-zA-Z\d][a-zA-Z\d._:/-]{0,159}$/u) ||
    !validOptionalId(cvId, /^cv:[a-zA-Z\d][a-zA-Z\d._-]{0,79}$/u) ||
    !validTimeout(timeoutMs)
  ) {
    invalid();
  }
  return { enabled, provider: 'claude-code', model, cvId, timeoutMs };
};

export const readAnswerModel = async (store) => {
  const saved = await store.get(ANSWER_MODEL_ID);
  if (
    saved &&
    (saved.id !== ANSWER_MODEL_ID || !revisionPattern.test(saved.revision))
  ) {
    invalid();
  }
  return {
    ...normalizeAnswerModel(saved ?? {}),
    revision: saved?.revision ?? null,
  };
};

export const saveAnswerModel = (store, input) =>
  writeAnswerKnowledge(store, async () => {
    const normalized = normalizeAnswerModel(input);
    const current = await readAnswerModel(store);
    if (input.revision !== current.revision) {
      throw answerModelFailure(
        'answer-model-changed',
        'Draft model settings changed. Reload before saving.'
      );
    }
    const settings = {
      ...normalized,
      revision: globalThis.crypto.randomUUID(),
    };
    await store.put({
      id: ANSWER_MODEL_ID,
      tokens: ['config', 'answer-model'],
      ...settings,
    });
    await store.flush?.();
    return { ok: true, ...settings };
  });
