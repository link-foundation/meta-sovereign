import { compareExperience, experienceDifferences } from './experience.js';
import { validateExperienceDocument } from './experience-document.js';

const textFields = ['company', 'title', 'description', 'location', 'about'];
const jobFields = [
  ...textFields.slice(0, 4),
  'start',
  'end',
  'current',
  'skills',
  'media',
];
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const present = (value) =>
  value !== undefined && value !== null && value !== '';
const note = (field, reason) => ({ field, reason });

const combined = (before, source) => {
  if (
    !Array.isArray(source) ||
    (before !== null && before !== undefined && !Array.isArray(before))
  ) {
    return null;
  }
  return [
    ...(before ?? []),
    ...source.filter(
      (value) => !(before ?? []).some((old) => same(old, value))
    ),
  ];
};
const textDirection = (value, language) => {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }
  const cyrillic = /\p{Script=Cyrillic}/u.test(value);
  const latin = /\p{Script=Latin}/u.test(value);
  return language === 'en'
    ? cyrillic
      ? 'ru'
      : null
    : !cyrillic && latin
      ? 'en'
      : null;
};

const fieldProposal = (field, source, before, language) => {
  const from = textFields.includes(field)
    ? textDirection(source, language)
    : null;
  let after = source;
  let reason = null;
  if (['skills', 'media'].includes(field)) {
    after = combined(before, source);
    if (after === null) {
      reason = 'unsupported-field';
    }
  }
  if (from && source.length > 12000) {
    reason = 'translation-limit';
  }
  return {
    field,
    source,
    before: before ?? null,
    after: from || reason ? null : after,
    ready: !from && !reason,
    from,
    to: from ? language : null,
    reason,
  };
};
const proposals = (source, target, fields, language) => {
  const notes = [];
  const changes = [];
  const different = new Set(
    experienceDifferences(source, target ?? {}).map((item) => item.field)
  );
  for (const field of fields) {
    if (textFields.includes(field) && textDirection(source[field], language)) {
      different.add(field);
    }
  }
  for (const field of different) {
    if (
      !Object.hasOwn(source, field) ||
      (!present(source[field]) && !(field === 'end' && source.current === true))
    ) {
      notes.push(note(field, 'missing-source-kept'));
    } else if (!fields.includes(field)) {
      notes.push(
        note(
          field,
          field === 'name' ? 'personal-name-review' : 'unsupported-field'
        )
      );
    } else {
      const proposal = fieldProposal(
        field,
        source[field],
        target?.[field],
        language
      );
      if (!proposal.ready || !same(proposal.after, proposal.before)) {
        changes.push(proposal);
      }
    }
  }
  return { fields: changes, notes };
};
const jobProposal = (source, target, sourceIndex, targetIndex, language) => ({
  sourceIndex,
  targetIndex,
  source,
  target,
  kind: target ? 'update' : 'add',
  ...proposals(source, target, jobFields, language),
});
const validPlatforms = (hh, linkedin, to) =>
  hh.platform === 'hh' &&
  linkedin.platform === 'linkedin' &&
  ['hh', 'linkedin'].includes(to);

/** Both original sides remain intact. Only explicit nonempty source fields propose changes. */
export const createExperiencePlan = (hhValue, linkedinValue, options) => {
  const hh = validateExperienceDocument(hhValue);
  const linkedin = validateExperienceDocument(linkedinValue);
  if (!validPlatforms(hh, linkedin, options.to)) {
    throw Object.assign(new Error('Experience plan input was not confirmed.'), {
      code: 'cv-experience-plan-input',
    });
  }
  const comparison = compareExperience(hh.jobs, linkedin.jobs, {
    asOf: options.asOf,
  });
  const toLinkedin = options.to === 'linkedin';
  const source = toLinkedin ? hh : linkedin;
  const target = toLinkedin ? linkedin : hh;
  const [a, b] = toLinkedin ? ['left', 'right'] : ['right', 'left'];
  const jobs = comparison.pairs.map((pair) =>
    jobProposal(
      pair[a],
      pair[b],
      pair[`${a}Index`],
      pair[`${b}Index`],
      target.source.language
    )
  );
  for (const { index, job } of toLinkedin
    ? comparison.onlyLeft
    : comparison.onlyRight) {
    jobs.push(jobProposal(job, null, index, null, target.source.language));
  }
  for (const { index, job } of toLinkedin
    ? comparison.onlyRight
    : comparison.onlyLeft) {
    jobs.push({
      kind: 'keep',
      sourceIndex: null,
      targetIndex: index,
      source: null,
      target: job,
      fields: [],
      notes: [note(null, 'target-only-kept')],
    });
  }
  for (const item of comparison.review) {
    const onSource = item.side === source.platform;
    jobs.push({
      kind: 'review',
      sourceIndex: onSource ? item.index : null,
      targetIndex: onSource ? null : item.index,
      source: onSource ? item.job : null,
      target: onSource ? null : item.job,
      fields: [],
      notes: [{ ...note(null, item.reason), candidates: item.candidates }],
    });
  }
  return {
    kind: 'cv-experience-plan',
    version: 1,
    requiresReview: true,
    providerSaved: false,
    input: options,
    source: {
      revision: options[source.platform],
      platform: source.platform,
      ...source.source,
    },
    target: {
      revision: options[target.platform],
      platform: target.platform,
      ...target.source,
    },
    jobs,
    profile: {
      source: source.profile,
      target: target.profile,
      ...proposals(
        source.profile,
        target.profile,
        ['about'],
        target.source.language
      ),
    },
    translations: [],
  };
};

/** Only unambiguous changes need translator calls; names, native IDs and skill brands stay literal. */
export const experienceTranslationTexts = (plan) => [
  ...new Set(
    [...plan.jobs, plan.profile].flatMap((item) =>
      item.fields
        .filter((field) => field.from && field.reason !== 'translation-limit')
        .map((field) => field.source)
    )
  ),
];

export const applyExperienceTranslations = (plan, comparisons) => {
  const translated = new Map(
    comparisons.flatMap((comparison) =>
      comparison.rows.map((row, index) => [
        row.source,
        { row, index, comparison },
      ])
    )
  );
  const item = (value) => ({
    ...value,
    fields: value.fields.map((field) => {
      if (!field.from || field.reason === 'translation-limit') {
        return field;
      }
      const found = translated.get(field.source);
      const ready =
        found?.comparison.state === 'completed' &&
        !!found.row.chosen &&
        (field.field !== 'company' || found.row.chosen.length <= 500);
      return {
        ...field,
        after: ready ? found.row.chosen : null,
        ready: !!ready,
        reason: ready ? null : 'translation-unconfirmed',
        translation: found
          ? { requestId: found.comparison.input.requestId, row: found.index }
          : null,
      };
    }),
  });
  return {
    ...plan,
    jobs: plan.jobs.map(item),
    profile: item(plan.profile),
    translations: comparisons,
  };
};
