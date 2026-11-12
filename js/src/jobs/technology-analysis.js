import { modelFingerprint } from '../automation/answer-model-context.js';
import { vacancyContent } from '../assignments/vacancy-content.js';
import { sanitizedResumeCv } from './resume-cv.js';
import {
  technologyMatcher,
  similarTechnologyNames,
} from './technology-mentions.js';
import { technologyFailure } from './technology-catalog.js';

const unique = (values) => [...new Set(values)];
const terms = (mentions) =>
  unique(
    mentions
      .filter((item) => item.candidates.length === 1)
      .map((item) => item.candidates[0])
  );
const frequencies = (values) =>
  [
    ...values.reduce(
      (map, value) => map.set(value, (map.get(value) ?? 0) + 1),
      new Map()
    ),
  ]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, 'en'));
const cvFields = (cv) => [
  ['about', cv.about],
  ...cv.skills.map((value, index) => [`skills.${index}`, value]),
  ...cv.jobs.map((job, index) => [
    `jobs.${index}.description`,
    job.description,
  ]),
];
const compare = (mentions, evidence, catalog, skills) => {
  const known = terms(evidence);
  const required = terms(
    mentions.filter((item) => item.requirement === 'required')
  );
  const preferred = terms(
    mentions.filter((item) => item.requirement === 'preferred')
  );
  const mentioned = terms(mentions);
  return {
    mentioned: mentioned.filter((term) => known.includes(term)),
    missing: mentioned.filter((term) => !known.includes(term)),
    requiredMissing: required.filter((term) => !known.includes(term)),
    preferredMissing: preferred.filter((term) => !known.includes(term)),
    aliasSuggestions: unique(
      mentions
        .filter(
          (item) =>
            item.candidates.length === 1 &&
            known.includes(item.candidates[0]) &&
            !evidence.some(
              (cv) =>
                cv.candidates.length === 1 &&
                cv.candidates[0] === item.candidates[0] &&
                cv.spelling === item.spelling
            )
        )
        .map((item) =>
          JSON.stringify({
            canonical: item.candidates[0],
            spelling: item.spelling,
          })
        )
    ).map(JSON.parse),
    spellingSuggestions: skills
      .filter(
        (skill) =>
          !catalog.entries.some((row) =>
            [row.canonical, ...row.aliases].some(
              (name) => name.toLowerCase() === skill.toLowerCase()
            )
          )
      )
      .map((spelling) => ({
        spelling,
        candidates: similarTechnologyNames(spelling, catalog.entries),
      }))
      .filter((item) => item.candidates.length),
  };
};
export const analyzeTechnologies = async ({
  catalog,
  vacancies,
  cv: raw,
  resume,
  signal,
}) => {
  if (!Array.isArray(vacancies) || vacancies.length > 100) {
    throw technologyFailure('limit');
  }
  const cv = sanitizedResumeCv(raw).cv;
  const snapshots = vacancies.map((row) => vacancyContent(row));
  if (
    new Set(snapshots.map((row) => row.url)).size !== snapshots.length ||
    JSON.stringify([snapshots, cv]).length > 4 * 1024 * 1024
  ) {
    throw technologyFailure('limit');
  }
  const scan = technologyMatcher(catalog.entries);
  const evidence = cvFields(cv).flatMap(([field, text]) => scan(text, field));
  if (evidence.length > 5000) {
    throw technologyFailure('limit');
  }
  const results = [];
  let totalMentions = evidence.length;
  for (const snapshot of snapshots) {
    signal?.throwIfAborted();
    const mentions = [
      ...scan(snapshot.description, 'description', true),
      ...snapshot.skills.flatMap((skill, index) =>
        scan(skill, `skills.${index}`)
      ),
    ];
    totalMentions += mentions.length;
    if (mentions.length > 2000 || totalMentions > 10000) {
      throw technologyFailure('limit');
    }
    const unrecognizedSkills = snapshot.skills.filter(
      (skill, index) =>
        !mentions.some(
          (item) =>
            item.field === `skills.${index}` &&
            item.start === 0 &&
            item.end === skill.length
        )
    );
    results.push({
      ...snapshot,
      fingerprint: await modelFingerprint(snapshot),
      mentions,
      unrecognizedSkills,
      comparison: compare(mentions, evidence, catalog, snapshot.skills),
    });
  }
  const technologies = unique(
    results.flatMap((row) => terms(row.mentions))
  ).sort();
  const statistics = technologies.map((canonical) => {
    const rows = results.filter((row) =>
      terms(row.mentions).includes(canonical)
    );
    return {
      canonical,
      vacancies: rows.length,
      required: rows.filter((row) =>
        row.mentions.some(
          (item) =>
            item.candidates.length === 1 &&
            item.candidates[0] === canonical &&
            item.requirement === 'required'
        )
      ).length,
      preferred: rows.filter((row) =>
        row.mentions.some(
          (item) =>
            item.candidates.length === 1 &&
            item.candidates[0] === canonical &&
            item.requirement === 'preferred'
        )
      ).length,
      spellings: frequencies(
        rows.flatMap((row) =>
          unique(
            row.mentions
              .filter(
                (item) =>
                  item.candidates.length === 1 &&
                  item.candidates[0] === canonical
              )
              .map((item) => item.spelling)
          )
        )
      ),
    };
  });
  const content = {
    catalogRevision: catalog.revision,
    resume,
    evidence,
    vacancies: results,
    statistics,
    metadata: Object.fromEntries(
      ['location', 'employment', 'experience', 'workFormat'].map((key) => [
        key,
        frequencies(results.map((row) => row[key]).filter(Boolean)),
      ])
    ),
  };
  if (JSON.stringify(content).length > 12 * 1024 * 1024) {
    throw technologyFailure('limit');
  }
  return {
    ...content,
    fingerprint: await modelFingerprint(content),
    capturedAt: new Date().toISOString(),
  };
};
