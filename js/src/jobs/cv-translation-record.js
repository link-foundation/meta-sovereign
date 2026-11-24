import { modelFingerprint } from '../automation/answer-model-context.js';
import { browserName } from '../browser/policy.js';
import { resumeExportRequestId } from './resume-export-options.js';

export const cvTranslationFailure = (code) =>
  Object.assign(new Error('The translation comparison was not confirmed.'), {
    code: `jobs-cv-translation-${code}`,
  });
export const CV_TRANSLATORS = ['haiku', 'luna', 'formal-ai'];
const languages = ['ru', 'en'];
const boundedText = (value) =>
  typeof value === 'string' &&
  value.trim().length > 0 &&
  value.length <= 12000 &&
  // eslint-disable-next-line no-control-regex -- Refuse non-text control bytes in private input.
  !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value);
const modelId = (value) =>
  typeof value === 'string' && /^[a-zA-Z\d][a-zA-Z\d._-]{0,119}$/u.test(value);
export const cvTranslationModelId = (provider, value, alias = false) =>
  modelId(value) &&
  (provider === 'haiku'
    ? (alias && value === 'haiku') || /^claude-haiku-\d[\d.-]*$/u.test(value)
    : provider === 'luna'
      ? /^gpt-\d+(?:\.\d+)*-luna(?:-\d{4}-\d{2}-\d{2})?$/u.test(value)
      : provider === 'formal-ai' &&
        /^\d+\.\d+\.\d+(?:-[\w.-]+)?$/u.test(value));

const validTexts = (texts) =>
  Array.isArray(texts) &&
  texts.length > 0 &&
  texts.length <= 50 &&
  texts.every(boundedText) &&
  new TextEncoder().encode(JSON.stringify(texts)).length <= 64000;
const validProviders = (providers) =>
  Array.isArray(providers) &&
  providers.length > 0 &&
  providers.length <= 3 &&
  new Set(providers).size === providers.length &&
  providers.every((name) => CV_TRANSLATORS.includes(name));
const validModels = (models) =>
  models &&
  typeof models === 'object' &&
  !Array.isArray(models) &&
  Object.keys(models).every(
    (name) =>
      ['haiku', 'luna'].includes(name) &&
      cvTranslationModelId(name, models[name], true)
  );

export const cvTranslationOptions = (input) => {
  const from = input?.from;
  const to = input?.to;
  const providers = input?.providers ?? CV_TRANSLATORS;
  const models = input?.models ?? {};
  if (
    !languages.includes(from) ||
    !languages.includes(to) ||
    from === to ||
    !validTexts(input?.texts) ||
    !validProviders(providers) ||
    !validModels(models)
  ) {
    throw cvTranslationFailure('input');
  }
  return {
    requestId: resumeExportRequestId(input.requestId),
    browserSlot: browserName(input.browserSlot ?? 'jobs'),
    from,
    to,
    texts: [...input.texts],
    providers: [...providers],
    models: { ...models },
  };
};

/** Conservative script checks are refusal guards, never a quality certificate. */
export const cvTranslationVerdict = (source, output, to) => {
  if (!boundedText(output)) {
    return { text: null, reason: 'empty-or-limit' };
  }
  const text = output.trim();
  let reason = null;
  if (
    /could not (?:translate|identify a source phrase)|translation gap/iu.test(
      text
    )
  ) {
    reason = 'translation-gap';
  } else if (/^response:[\w-]+$/iu.test(text)) {
    reason = 'placeholder';
  } else if (/web search requested|поиск в интернете запрошен/iu.test(text)) {
    reason = 'misrouted';
  } else if (text.toLowerCase() === source.trim().toLowerCase()) {
    reason = 'unchanged';
  } else if (
    (to === 'en' &&
      (!/[a-z]/iu.test(text) || /\p{Script=Cyrillic}/u.test(text))) ||
    (to === 'ru' && !/\p{Script=Cyrillic}/u.test(text))
  ) {
    reason = 'wrong-language';
  }
  return { text: reason ? null : text, reason };
};

const states = ['running', 'completed', 'interrupted', 'stopped', 'failed'];
const invalidVariantOutput = (variant, verdict) =>
  (variant.output !== null &&
    (typeof variant.output !== 'string' || variant.output.length > 12000)) ||
  (variant.output !== null &&
    variant.text === null &&
    (verdict.text !== null || variant.reason !== verdict.reason)) ||
  (variant.text !== null &&
    (variant.reason !== null || verdict.text !== variant.text));
const invalidVariant = (variant, provider, source, to) =>
  variant.provider !== provider ||
  (variant.model !== null && !cvTranslationModelId(provider, variant.model)) ||
  typeof variant.cached !== 'boolean' ||
  (variant.reason !== null &&
    (typeof variant.reason !== 'string' ||
      !/^[a-z-]{1,50}$/u.test(variant.reason))) ||
  (variant.cached && variant.text === null) ||
  (variant.text === null && !variant.reason) ||
  (variant.text !== null && variant.model === null) ||
  invalidVariantOutput(
    variant,
    cvTranslationVerdict(source, variant.output, to)
  );
const validHeader = async (content, fingerprint, input, expected) =>
  content.version === 1 &&
  states.includes(content.state) &&
  content.providerSaved === false &&
  content.requiresReview === true &&
  Number.isFinite(Date.parse(content.createdAt)) &&
  fingerprint === (await modelFingerprint(content)) &&
  (await modelFingerprint(content.input)) === (await modelFingerprint(input)) &&
  Array.isArray(content.rows) &&
  content.rows.length === input.texts.length &&
  Object.entries(expected).every(([key, value]) => input[key] === value);
export const fingerprintCvTranslation = async (content) => ({
  ...content,
  fingerprint: await modelFingerprint(content),
});
const validRow = (row, index, input) => {
  if (
    row.source !== input.texts[index] ||
    !Array.isArray(row.variants) ||
    row.variants.length !== input.providers.length
  ) {
    return false;
  }
  const selected = row.variants.find((variant) => variant.text);
  return (
    !row.variants.some((variant, position) =>
      invalidVariant(variant, input.providers[position], row.source, input.to)
    ) &&
    row.chosen === (selected?.text ?? null) &&
    row.chosenBy === (selected?.provider ?? null)
  );
};
export const confirmedCvTranslation = async (answer, expected = {}) => {
  if (answer?.comparison === null) {
    if (answer.cancelled) {
      const identity = {
        requestId: resumeExportRequestId(answer.cancelled.requestId),
        browserSlot: browserName(answer.cancelled.browserSlot),
      };
      if (
        Object.entries(expected).some(([key, value]) => identity[key] !== value)
      ) {
        throw cvTranslationFailure('receipt');
      }
      return { comparison: null, cancelled: identity };
    }
    return { comparison: null };
  }
  const comparison = answer?.comparison;
  const { fingerprint, ...content } = comparison ?? {};
  const input = cvTranslationOptions(content.input);
  if (!(await validHeader(content, fingerprint, input, expected))) {
    throw cvTranslationFailure('receipt');
  }
  for (const [index, row] of content.rows.entries()) {
    if (!validRow(row, index, input)) {
      throw cvTranslationFailure('receipt');
    }
  }
  return { comparison };
};
