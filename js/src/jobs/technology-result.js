import { modelFingerprint } from '../automation/answer-model-context.js';
import { technologyCatalog, technologyFailure } from './technology-catalog.js';
import { resumeExportId } from './resume-export-result.js';
import { resumeHash } from './resume-list.js';
import { browserName } from '../browser/policy.js';
import { vacancyContent } from '../assignments/vacancy-content.js';
import { technologyEvidenceShape } from './technology-shape.js';

const digest = (value) =>
  typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
export const confirmedTechnologyCatalog = async (value, input) => {
  const catalog = await technologyCatalog(value?.entries);
  if (
    value.revision !== catalog.revision ||
    (input &&
      catalog.revision !== (await technologyCatalog(input.entries)).revision)
  ) {
    throw technologyFailure('unconfirmed');
  }
  return catalog;
};
const boundedAnalysis = (analysis) => {
  if (
    !analysis ||
    JSON.stringify(analysis).length > 12 * 1024 * 1024 ||
    !Array.isArray(analysis.vacancies) ||
    analysis.vacancies.length > 100 ||
    !Array.isArray(analysis.evidence) ||
    analysis.evidence.length > 5000 ||
    !Array.isArray(analysis.statistics) ||
    analysis.statistics.length > 256 ||
    !Number.isFinite(Date.parse(analysis.capturedAt)) ||
    !digest(analysis.catalogRevision)
  ) {
    throw technologyFailure('unconfirmed');
  }
};
const confirmedResume = (resume, revision, input) => {
  resumeExportId(resume?.exportId);
  resumeHash(resume.hash);
  browserName(resume.browserSlot);
  if (
    !digest(resume.sha256) ||
    !['ru', 'en'].includes(resume.language) ||
    (input &&
      ['exportId', 'hash', 'browserSlot'].some(
        (key) => input[key] !== resume[key]
      )) ||
    (input?.revision && input.revision !== revision)
  ) {
    throw technologyFailure('unconfirmed');
  }
};
export const confirmedTechnologyAnalysis = async (value, input) => {
  if (value?.analysis === null) {
    return value;
  }
  const analysis = value?.analysis;
  boundedAnalysis(analysis);
  confirmedResume(analysis.resume, analysis.catalogRevision, input);
  if (!technologyEvidenceShape(analysis)) {
    throw technologyFailure('unconfirmed');
  }
  for (const vacancy of analysis.vacancies) {
    vacancyContent(vacancy);
    if (
      !Array.isArray(vacancy.mentions) ||
      vacancy.mentions.length > 2000 ||
      !vacancy.comparison ||
      !Array.isArray(vacancy.unrecognizedSkills)
    ) {
      throw technologyFailure('unconfirmed');
    }
  }
  const { fingerprint, capturedAt: _capturedAt, ...content } = analysis;
  if (fingerprint !== (await modelFingerprint(content))) {
    throw technologyFailure('unconfirmed');
  }
  return { analysis };
};
