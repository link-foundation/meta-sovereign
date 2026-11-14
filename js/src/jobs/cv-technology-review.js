import { technologyFailure } from './technology-catalog.js';
import {
  technologyNormalizer,
  technologyKey,
  compareTechnologyLabels,
} from './cv-technology-names.js';
import {
  aboutTechnologyInventory,
  jobTechnologyInventory,
  renderAboutTechnologies,
  renderJobTechnologies,
  technologyCategories,
} from './cv-technology-lists.js';
import { technologyJobPairs } from './cv-technology-pairs.js';

const unique = (terms) => {
  const found = new Map();
  for (const term of terms.filter((item) => item.canonical)) {
    const id = technologyKey(term.canonical);
    const old = found.get(id);
    found.set(id, {
      ...term,
      observed: [
        ...new Set([...(old?.observed ?? []), ...(term.observed ?? [])]),
      ],
    });
  }
  return [...found.values()];
};
const fieldInventory = (source, field, rawTerms, names, raw) => {
  const normalized = rawTerms.flatMap(names.expand);
  const seen = new Set();
  const duplicates = normalized.filter((term) => {
    const id = technologyKey(term.canonical);
    if (!id) {
      return false;
    }
    if (seen.has(id)) {
      return true;
    }
    seen.add(id);
    return false;
  });
  // The field-local spelling remains the evidence, even when another field uses it.
  const mentions = names.scan(raw, field);
  return {
    language: source.cv.language,
    field,
    raw,
    rawTerms,
    normalized,
    duplicates,
    mentions,
  };
};
const prepareSource = (source, names) => {
  const about = aboutTechnologyInventory(source.cv.about);
  const jobs = source.cv.jobs.map((job) =>
    jobTechnologyInventory(job.description)
  );
  return {
    source,
    about,
    jobs,
    fields: [
      fieldInventory(
        source,
        'about',
        [...about.categories.flatMap((row) => row.terms), ...about.legacyTerms],
        names,
        source.cv.about
      ),
      fieldInventory(
        source,
        'skills',
        source.cv.skills,
        names,
        source.cv.skills.join('\n')
      ),
      ...jobs.map((job, index) =>
        fieldInventory(
          source,
          `jobs.${index}.description`,
          job.terms,
          names,
          job.raw
        )
      ),
    ],
  };
};
const fieldTerms = (field, names) =>
  unique([
    ...field.normalized,
    ...field.mentions
      .filter((item) => item.candidates.length === 1)
      .map((item) => names.normalize(item.candidates[0])),
  ]);
const proposedChange = (source, field, before, after, terms) => {
  if (after.length > 24000) {
    throw technologyFailure('limit');
  }
  return {
    id: `${source.cv.language}:${field}`,
    language: source.cv.language,
    hash: source.identity.hash,
    field,
    before,
    after,
    technologies: terms.map((term) => term.canonical),
  };
};

const categoryAssignments = (prepared, names) => {
  const categoryByName = new Map();
  for (const row of prepared) {
    for (const group of row.about.categories) {
      for (const raw of group.terms) {
        for (const term of names.expand(raw)) {
          const id = technologyKey(term.canonical);
          if (!categoryByName.has(id)) {
            categoryByName.set(id, group.category);
          }
        }
      }
    }
  }
  return categoryByName;
};
const proposeFields = ({
  prepared,
  names,
  observed,
  registry,
  changes,
  coverage,
  pairing,
}) => {
  const categoryByName = categoryAssignments(prepared, names);
  for (const [sourceIndex, row] of prepared.entries()) {
    const language = row.source.cv.language;
    const render = (terms) =>
      terms
        .map((term) => names.label(term, observed, language))
        .sort((a, b) => compareTechnologyLabels(a, b, language));
    const categories = Object.fromEntries(
      Object.keys(technologyCategories).map((id) => [id, []])
    );
    for (const term of registry) {
      categories[
        categoryByName.get(technologyKey(term.canonical)) ?? 'technologies'
      ].push(names.label(term, observed, language));
    }
    for (const terms of Object.values(categories)) {
      terms.sort((a, b) => compareTechnologyLabels(a, b, language));
    }
    const about =
      row.about.blockers.length || !registry.length
        ? row.source.cv.about
        : renderAboutTechnologies(row.about, categories, language);
    changes.push(
      proposedChange(row.source, 'about', row.source.cv.about, about, registry)
    );
    coverage.push({
      language,
      field: 'about',
      before: fieldTerms(row.fields[0], names).map((term) => term.canonical),
      proposed: registry.map((term) => term.canonical),
    });
    for (const [index, job] of row.jobs.entries()) {
      const field = row.fields[index + 2];
      const pair = pairing.pairs.find((item) => item[sourceIndex] === index);
      const otherIndex = pair?.[1 - sourceIndex];
      const other =
        otherIndex === undefined
          ? null
          : prepared[1 - sourceIndex].fields[otherIndex + 2];
      const terms = unique([
        ...fieldTerms(field, names),
        ...(other ? fieldTerms(other, names) : []),
      ]);
      const after = terms.length
        ? renderJobTechnologies(job, render(terms), language)
        : job.raw;
      changes.push(
        proposedChange(row.source, field.field, job.raw, after, terms)
      );
      coverage.push({
        language,
        field: field.field,
        before: fieldTerms(field, names).map((term) => term.canonical),
        proposed: terms.map((term) => term.canonical),
        counterpart: otherIndex ?? null,
      });
    }
  }
};

/** Read-only bilingual proposals. Provider writes require a separate verified executor. */
export const buildCvTechnologyReview = ({
  sources,
  catalog,
  observed = [],
}) => {
  if (
    sources.length !== 2 ||
    !sources.every((row) => ['ru', 'en'].includes(row.cv.language)) ||
    new Set(sources.map((row) => row.cv.language)).size !== 2
  ) {
    throw technologyFailure('resume');
  }
  const names = technologyNormalizer(catalog);
  const prepared = sources.map((source) => prepareSource(source, names));
  const fields = prepared.flatMap((row) => row.fields);
  if (
    fields.reduce(
      (sum, field) => sum + field.mentions.length + field.normalized.length,
      0
    ) > 10000
  ) {
    throw technologyFailure('limit');
  }
  const registry = unique(fields.flatMap((field) => fieldTerms(field, names)));
  if (registry.length > 1000) {
    throw technologyFailure('limit');
  }
  const pairing = technologyJobPairs(sources);
  const blockers = [
    ...pairing.blockers,
    ...prepared.flatMap((row) =>
      row.about.blockers.map((item) => ({
        ...item,
        language: row.source.cv.language,
        field: 'about',
      }))
    ),
    ...fields.flatMap((field) =>
      field.normalized
        .filter((term) => term.ambiguous)
        .map((term) => ({
          code: 'alias-ambiguous',
          language: field.language,
          field: field.field,
          raw: term.raw,
          candidates: term.candidates,
        }))
    ),
    ...fields.flatMap((field) =>
      field.mentions
        .filter((term) => term.candidates.length > 1)
        .map((term) => ({
          code: 'alias-ambiguous',
          language: field.language,
          field: field.field,
          raw: term.spelling,
          candidates: term.candidates,
        }))
    ),
  ];
  const changes = [];
  const coverage = [];
  proposeFields({
    prepared,
    names,
    observed,
    registry,
    changes,
    coverage,
    pairing,
  });
  return {
    technologies: registry.map((term) => ({
      canonical: term.canonical,
      known: term.known === true,
    })),
    fields,
    pairs: pairing.pairs,
    blockers,
    changes: changes.filter((item) => item.before !== item.after),
    coverage,
    complete:
      blockers.length === 0 &&
      changes.every((item) => item.before === item.after),
  };
};
