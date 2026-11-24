import {
  assignmentSourceUrl,
  assignmentVacancyUrl,
} from '../assignments/validation.js';

/** POSIX shell quoting is deliberate: employer URLs can contain apostrophes. */
export const vacancySkipPrefillCommand = (entry) => {
  if (entry.reason !== 'external_site' || !entry.externalUrl) {
    return null;
  }
  const url = assignmentSourceUrl(entry.externalUrl);
  const vacancy = assignmentVacancyUrl(entry.url).split('/').at(-1);
  const quoted = `'${url.replaceAll("'", "'\"'\"'")}'`;
  return `meta-sovereign forms-review --prefill --url=${quoted} --browser-slot=hh-external-${vacancy}`;
};
