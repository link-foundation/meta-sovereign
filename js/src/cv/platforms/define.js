/**
 * Platform descriptor factory (R-V3).
 *
 * A descriptor bundles everything the runner, the CLI and the SPA need
 * to know about one job board: where its CV lives, how a session is
 * established, what we have actually observed on the public internet,
 * and the ordered plans for reading and updating. Derived fields
 * (supported paths, confidence tally) are computed here so callers
 * never recompute them inconsistently.
 */

import { CV_SECTIONS, RECORD_SECTIONS } from '../model.js';
import { draftSteps, validateSteps } from './steps.js';

const recordFieldsOf = (section) => RECORD_SECTIONS[section]?.fields ?? [];

/** Group of update steps guarded by the canonical paths they write. */
export const updateGroup = (id, paths, steps, options = {}) => ({
  id,
  paths,
  steps,
  ...(options.note ? { note: options.note } : {}),
  ...(options.optional ? { optional: true } : {}),
});

const pathsOf = (steps) =>
  steps.filter((step) => step.path).map((step) => step.path);

const providedSectionsOf = (steps) => [
  ...new Set(
    steps
      .filter((step) => step.action === 'extractJson')
      .flatMap((step) => step.provides ?? [])
  ),
];

const tally = (steps) =>
  steps.reduce((acc, step) => {
    acc[step.confidence] = (acc[step.confidence] ?? 0) + 1;
    return acc;
  }, {});

/**
 * @param {object} descriptor raw platform definition
 * @returns {object} frozen descriptor with derived metadata
 */
export const definePlatform = (descriptor) => {
  const update = descriptor.update ?? [];
  const updateSteps = update.flatMap((group) => group.steps);
  const allSteps = [...descriptor.read, ...updateSteps];
  return Object.freeze({
    sourceName: descriptor.id,
    region: 'global',
    locales: ['en'],
    mappers: {},
    notes: [],
    evidence: [],
    ...descriptor,
    update,
    readPaths: [...new Set(pathsOf(descriptor.read))],
    providedSections: providedSectionsOf(descriptor.read),
    writePaths: [...new Set(update.flatMap((group) => group.paths))],
    confidence: tally(allSteps),
    draftCount: draftSteps(allSteps).length,
    stepCount: allSteps.length,
  });
};

const groupProblems = (platform, group) => {
  const problems = validateSteps(
    group.steps,
    `${platform.id}.update.${group.id}`
  );
  if (!Array.isArray(group.paths) || group.paths.length === 0) {
    problems.push(`${platform.id}.update.${group.id}: no guarded paths`);
  }
  return problems;
};

const recordProblems = (platform, step) => {
  const known = recordFieldsOf(step.path);
  return Object.keys(step.fields ?? {})
    .filter((field) => !known.includes(field) && field !== step.durationField)
    .map((field) => `${platform.id}: ${step.path} has no field "${field}"`);
};

const referenceProblems = (platform, step, isKnownPath) => {
  const problems = [];
  if (step.mapper && !platform.mappers[step.mapper]) {
    problems.push(`${platform.id}: missing mapper "${step.mapper}"`);
  }
  for (const section of step.provides ?? []) {
    if (!CV_SECTIONS.includes(section)) {
      problems.push(
        `${platform.id}: mapper "${step.mapper}" provides unknown section "${section}"`
      );
    }
  }
  if (step.path && !isKnownPath(step.path)) {
    problems.push(`${platform.id}: unknown canonical path "${step.path}"`);
  }
  return problems;
};

/**
 * Validate a descriptor end to end: plan shapes, referenced mappers,
 * update groups that write paths the model does not know, and the
 * presence of evidence for anything claimed as `verified`.
 * @param {object} platform
 * @param {(path: string) => boolean} isKnownPath
 * @returns {string[]}
 */
export const validatePlatform = (platform, isKnownPath) => {
  const updateSteps = platform.update.flatMap((group) => group.steps);
  const problems = [
    ...validateSteps(platform.read, `${platform.id}.read`),
    ...platform.update.flatMap((group) => groupProblems(platform, group)),
    ...platform.read
      .filter((step) => step.action === 'readRecords')
      .flatMap((step) => recordProblems(platform, step)),
    ...[...platform.read, ...updateSteps].flatMap((step) =>
      referenceProblems(platform, step, isKnownPath)
    ),
  ];
  for (const path of platform.writePaths) {
    const section = path.split(/[.[]/)[0];
    const readable =
      platform.readPaths.includes(path) ||
      platform.readPaths.some((known) => known.split(/[.[]/)[0] === section) ||
      platform.providedSections.includes(section);
    if (!readable) {
      problems.push(`${platform.id}: writes "${path}" but never reads it back`);
    }
  }
  if (!platform.urls?.login) {
    problems.push(`${platform.id}: no login URL`);
  }
  if (platform.confidence.verified > 0 && platform.evidence.length === 0) {
    problems.push(`${platform.id}: verified steps without evidence`);
  }
  return problems;
};
