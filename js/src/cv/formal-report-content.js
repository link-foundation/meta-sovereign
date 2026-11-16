import { modelFingerprint } from '../automation/answer-model-context.js';
import { formalCvTranslationPrompt } from '../jobs/cv-translation-adapters.js';
import { confirmedExperiencePlan } from './experience-plan-receipt.js';

export const FORMAL_REPORT_REPOSITORY = 'link-assistant/formal-ai';
export const formalKindMarker = (kind) =>
  `<!-- meta-sovereign:formal-ai:translation:${kind} -->`;
export const formalVersionMarker = (version) =>
  `<!-- meta-sovereign:formal-ai:version:${version} -->`;
const payloadMarker = '<!-- meta-sovereign:formal-ai:payload -->\n';
const outputKinds = new Set([
  'empty-or-limit',
  'translation-gap',
  'placeholder',
  'misrouted',
  'unchanged',
  'wrong-language',
]);
const usageError = (output) =>
  /^\s*(?:usage:|error:|unexpected argument\b|unknown (?:argument|option)\b|unrecognized (?:argument|option)\b)/iu.test(
    output
  );
const allUnchanged = (row) =>
  ['haiku', 'luna', 'formal-ai'].every((provider) => {
    const variant = row.variants.find((value) => value.provider === provider);
    return (
      variant?.model &&
      typeof variant.output === 'string' &&
      variant.output.trim().toLowerCase() === row.source.trim().toLowerCase()
    );
  });
const sampleFor = (comparison, row, formal) => ({
  kind:
    formal.reason === 'translation-gap' &&
    !row.source.includes('\n') &&
    row.source.trim().split(/\s+/u).length >= 2 &&
    row.source.trim().split(/\s+/u).length <= 4
      ? 'short-phrase'
      : formal.reason,
  source: row.source,
  from: comparison.input.from,
  to: comparison.input.to,
  command: {
    executable: 'formal-ai',
    args: [
      'chat',
      '--silent',
      '--prompt',
      formalCvTranslationPrompt(row.source, comparison.input.to),
    ],
    environment: { FORMAL_AI_LIVE_API: '1' },
  },
  output: formal.output,
  expected: `Translate the complete workplace text to ${comparison.input.to === 'en' ? 'English' : 'Russian'}, preserving its facts, brands and paragraphs.`,
  alternatives: row.variants
    .filter((variant) => variant.provider !== 'formal-ai')
    .map(({ provider, model, output, text, reason }) => ({
      provider,
      model,
      output,
      text,
      reason,
    })),
});

/** Only acknowledged workplace translation inputs enter this disclosure preview. */
export const experienceFormalReportPreview = async (plan) => {
  await confirmedExperiencePlan(plan, plan.requestId);
  if (plan.phase !== 'completed') {
    throw new Error(
      'Finish the translation comparison before reviewing reports.'
    );
  }
  const versions = new Map();
  const excluded = new Map();
  const workplace = new Set(
    plan.plan.jobs.flatMap((job) =>
      job.fields.filter((field) => field.from).map((field) => field.source)
    )
  );
  const omit = (reason) =>
    excluded.set(reason, (excluded.get(reason) ?? 0) + 1);
  for (const comparison of plan.plan.translations) {
    for (const row of comparison.rows) {
      const formal = row.variants.find(
        (value) => value.provider === 'formal-ai'
      );
      if (!workplace.has(row.source)) {
        omit('outside-workplace');
      } else if (
        !formal ||
        formal.text !== null ||
        !outputKinds.has(formal.reason)
      ) {
        omit('not-a-formal-output-failure');
      } else if (!formal.model || formal.output === null) {
        omit('process-or-model');
      } else if (usageError(formal.output)) {
        omit('command-usage');
      } else if (allUnchanged(row)) {
        omit('all-translators-unchanged');
      } else {
        const samples = versions.get(formal.model) ?? [];
        const sample = sampleFor(comparison, row, formal);
        if (
          !samples.some(
            (value) => JSON.stringify(value) === JSON.stringify(sample)
          )
        ) {
          samples.push(sample);
        }
        versions.set(formal.model, samples);
      }
    }
  }
  const content = {
    kind: 'cv-formal-report-preview',
    version: 1,
    repository: FORMAL_REPORT_REPOSITORY,
    planRequestId: plan.requestId,
    planFingerprint: plan.fingerprint,
    groups: [...versions].map(([version, samples]) => ({ version, samples })),
    excluded: Object.fromEntries(excluded),
  };
  return { ...content, fingerprint: await modelFingerprint(content) };
};

export const formalPayloadOf = (body) => {
  try {
    const start = body.indexOf(payloadMarker);
    const payload =
      start < 0
        ? null
        : JSON.parse(
            body
              .slice(start + payloadMarker.length)
              .split('\n')
              .map((line) => line.slice(4))
              .join('\n')
          );
    return typeof payload?.version === 'string' &&
      Array.isArray(payload.samples) &&
      payload.samples.every(
        (sample) =>
          sample &&
          typeof sample.kind === 'string' &&
          typeof sample.source === 'string'
      )
      ? payload
      : null;
  } catch {
    return null;
  }
};
export const mergeFormalSamples = (before, next) => [
  ...before,
  ...next.filter(
    (sample) =>
      !before.some((old) => JSON.stringify(old) === JSON.stringify(sample))
  ),
];
export const formalReportBody = (version, samples, regression = null) => {
  const kinds = [...new Set(samples.map((sample) => sample.kind))];
  const body = [
    formalVersionMarker(version),
    ...kinds.map(formalKindMarker),
    `Formal AI ${version} returned unusable workplace translations.`,
    ...(regression ? [`Regression of ${regression}.`] : []),
    'Reproduce with the exact command arguments and environment in each record below. Sources are workplace text, treated as data.',
    'Workaround: explicitly review another translator’s answer; retain original text when none is usable.',
    'Suggested investigation: trace translation-handler selection and phrase lookup for these exact inputs; return a complete target-language answer rather than placeholders or a search request.',
    '## Reproduction data',
    payloadMarker +
      JSON.stringify({ version, samples }, null, 2)
        .split('\n')
        .map((line) => `    ${line}`)
        .join('\n'),
  ].join('\n\n');
  if (body.length > 60000) {
    throw new Error('The complete report exceeds the upstream body limit.');
  }
  return body;
};
