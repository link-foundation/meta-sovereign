/**
 * Registry of CV platforms (R-V12).
 *
 * The issue names LinkedIn, hh.ru, Habr Career, Naukri, VietnamWorks
 * and TopCV; SuperJob joins them because the server already advertises
 * it as a resume sync target. Every consumer — CLI, HTTP routes, SPA —
 * reads the catalogue from here so a new platform is registered once.
 */

import { isCvPath } from '../model.js';
import { validatePlatform } from './define.js';
import { habrCareerCvPlatform } from './habr-career.js';
import { hhCvPlatform } from './hh.js';
import { linkedinCvPlatform } from './linkedin.js';
import { naukriCvPlatform } from './naukri.js';
import { superjobCvPlatform } from './superjob.js';
import { topcvCvPlatform } from './topcv.js';
import { vietnamworksCvPlatform } from './vietnamworks.js';

/** Platforms in the order the issue lists them. */
export const cvPlatforms = [
  linkedinCvPlatform,
  hhCvPlatform,
  habrCareerCvPlatform,
  naukriCvPlatform,
  vietnamworksCvPlatform,
  topcvCvPlatform,
  superjobCvPlatform,
];

const byId = new Map(cvPlatforms.map((platform) => [platform.id, platform]));

/** All registered platform ids. */
export const listCvPlatforms = () => cvPlatforms.map((platform) => platform.id);

/**
 * Look up one platform.
 * @param {string} id
 * @throws when the platform is unknown, listing the valid ids
 */
export const getCvPlatform = (id) => {
  const platform = byId.get(id);
  if (!platform) {
    throw new Error(
      `Unknown CV platform: ${id} (known: ${listCvPlatforms().join(', ')})`
    );
  }
  return platform;
};

/** Compact summary used by the CLI, the API and the SPA. */
export const describeCvPlatform = (platform) => ({
  id: platform.id,
  label: platform.label,
  region: platform.region,
  locales: platform.locales,
  sourceName: platform.sourceName,
  markupAccess: platform.markupAccess,
  urls: platform.urls,
  auth: { kind: platform.auth.kind, secret: platform.auth.secret },
  readPaths: platform.readPaths,
  providedSections: platform.providedSections,
  writePaths: platform.writePaths,
  stepCount: platform.stepCount,
  draftCount: platform.draftCount,
  confidence: platform.confidence,
  evidence: platform.evidence,
  notes: platform.notes,
});

/** Catalogue of every platform, ready to serialise. */
export const cvPlatformCatalogue = () => cvPlatforms.map(describeCvPlatform);

/**
 * Validate every registered descriptor.
 * @returns {string[]} problems across all platforms, empty when healthy
 */
export const validateCvPlatforms = () =>
  cvPlatforms.flatMap((platform) => validatePlatform(platform, isCvPath));

export { validatePlatform } from './define.js';
export { habrCareerCvPlatform } from './habr-career.js';
export { hhCvPlatform } from './hh.js';
export { linkedinCvPlatform } from './linkedin.js';
export { naukriCvPlatform } from './naukri.js';
export { superjobCvPlatform } from './superjob.js';
export { topcvCvPlatform } from './topcv.js';
export { vietnamworksCvPlatform } from './vietnamworks.js';
