import { storedExperienceDocument } from '../cv/experience-store.js';
import { sanitizedResumeCv } from './resume-cv.js';

/** Project only public CV fields. The immutable full document stays private. */
export const experiencePublicationSnapshot = async (store, revision) => {
  const { document } = await storedExperienceDocument(store, revision);
  const { profile, source } = document;
  const { cv } = sanitizedResumeCv({
    language: source.language,
    name: profile.name,
    title:
      profile.title ??
      (source.language === 'ru' ? 'Опыт работы' : 'Experience'),
    skills: profile.skills ?? [],
    about: profile.about,
    jobs: document.jobs.map((job) => ({
      company: job.company,
      position: job.title,
      start: job.start ?? null,
      end: job.end ?? null,
      current: job.current,
      area: job.location,
      description: job.description,
      website: job.native?.website,
      industries: job.native?.industries ?? [],
      ...(job.native?.areaId === undefined
        ? {}
        : { areaId: job.native.areaId }),
    })),
  });
  return {
    hash: revision,
    cv,
    sha256: revision,
    savedAt: source.capturedAt,
  };
};
