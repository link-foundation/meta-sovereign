import { loadResumeAreas, resolveResumeArea } from './areas.js';
import { loadResumeIndustries, resolveResumeIndustry } from './industries.js';
import { resumePeriod } from './resume-dates.js';
import { sanitizedResumeCv } from './resume-cv.js';

/** One conversion for native downloads and independent post-Save readback. */
export const resumeExportContent = async ({
  raw,
  store,
  signal,
  fetchAreas = loadResumeAreas,
  fetchIndustries = loadResumeIndustries,
}) => {
  const options = { store, language: raw.language, signal };
  const areaEntries = raw.jobs.some((job) => job.area)
    ? await fetchAreas(options)
    : [];
  signal?.throwIfAborted();
  const industryEntries = raw.jobs.some((job) => job.industries.length)
    ? await fetchIndustries(options)
    : [];
  signal?.throwIfAborted();
  const rawCv = {
    ...raw,
    jobs: raw.jobs.map((job) => ({
      ...job,
      ...resumePeriod(job.period),
      areaId: resolveResumeArea(job.area, areaEntries)?.id ?? null,
      industries: job.industries.map((industry) =>
        resolveResumeIndustry(industry, industryEntries)
      ),
    })),
  };
  return { rawCv, ...sanitizedResumeCv(rawCv), areaEntries, industryEntries };
};
