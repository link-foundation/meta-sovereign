import { verifiedTechnologyCv } from '../jobs/technology-cv.js';
import { observedResumeAbout } from '../jobs/resume-cv.js';
import { storedTechnologyCatalog } from '../jobs/technology-catalog.js';
import {
  technologyNormalizer,
  technologyKey,
  compareTechnologyLabels,
} from '../jobs/cv-technology-names.js';
import { jobTechnologyInventory } from '../jobs/cv-technology-lists.js';
import { validateExperienceDocument } from './experience-document.js';
import { saveExperienceDocument } from './experience-store.js';

const skillsFor = (job, names, language) => {
  const explicit = [
    ...(job.skills ?? []),
    ...jobTechnologyInventory(job.description ?? '').terms,
  ];
  const terms = [
    ...explicit.flatMap(names.expand),
    ...names
      .scan(job.description ?? '', 'description')
      .filter((mention) => mention.candidates.length === 1)
      .map((mention) => names.normalize(mention.candidates[0])),
  ];
  return [
    ...new Map(
      terms
        .filter((term) => term.canonical && !term.ambiguous)
        .map((term) => [technologyKey(term.canonical), term.canonical])
    ).values(),
  ].sort((a, b) => compareTechnologyLabels(a, b, language));
};
/** Reuse an acknowledged native export. This function never launches a browser. */
export const experienceFromHhExport = async (context, input) => {
  const { cv, identity } = await verifiedTechnologyCv(context, input);
  const names = technologyNormalizer(
    await storedTechnologyCatalog(context.store)
  );
  const { jobs, about: _about, aboutObserved: _aboutObserved, ...profile } = cv;
  const about = observedResumeAbout(cv);
  const document = validateExperienceDocument({
    kind: 'cv-experience',
    version: 1,
    platform: 'hh',
    source: {
      id: identity.hash,
      url: `https://hh.ru/resume/${identity.hash}`,
      language: identity.language,
      capturedAt: identity.capturedAt,
    },
    profile: about === undefined ? profile : { ...profile, about },
    jobs: jobs.map((job) =>
      Object.fromEntries(
        Object.entries({
          company: job.company,
          title: job.position,
          location: job.area,
          start: job.start,
          end: job.end,
          current: job.current,
          description: job.description,
          skills: skillsFor(job, names, cv.language),
          native: job,
        }).filter(([, value]) => value !== undefined)
      )
    ),
  });
  context.signal?.throwIfAborted();
  return saveExperienceDocument(context.store, document, {
    kind: 'hh-export',
    identity,
  });
};
