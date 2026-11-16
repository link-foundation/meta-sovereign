import { resumePeriod } from '../jobs/resume-dates.js';
import {
  validateExperienceDocument,
  experienceDocumentFailure,
} from './experience-document.js';

export const linkedinExperienceUrl = (value) => {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw experienceDocumentFailure();
  }
  if (
    url.origin !== 'https://www.linkedin.com' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !/^\/in\/[a-zA-Z\d_%.-]{1,200}\/details\/experience\/$/u.test(url.pathname)
  ) {
    throw experienceDocumentFailure();
  }
  return url.href;
};
const jobFrom = (item, role, grouped) => {
  const { parent } = item;
  const company = grouped
    ? parent.title
    : role.lines.find((line) => line !== role.period);
  if (
    !company ||
    !role.title ||
    !role.period ||
    !/(?:19|20)\d{2}/u.test(role.period)
  ) {
    throw experienceDocumentFailure();
  }
  const marks = role.marks ?? [];
  const skills = marks.filter((mark) =>
    /\/details\/skills\/|\/skill-associations\//u.test(mark.href)
  );
  const media = marks.filter((mark) => {
    try {
      const host = new URL(mark.href).hostname;
      return host !== 'linkedin.com' && !host.endsWith('.linkedin.com');
    } catch {
      return false;
    }
  });
  return {
    company: company.split(' · ')[0],
    title: role.title,
    location:
      role.lines
        .filter((line) => line !== role.period && line !== company)
        .at(-1) ?? '',
    ...resumePeriod(role.period),
    description: role.descriptions
      .filter((part) => !skills.some((mark) => mark.text === part))
      .join('\n'),
    skills: skills.map((mark) =>
      mark.text.replace(/^(?:skills|навыки):\s*/iu, '')
    ),
    media: media.map((mark) => ({ url: mark.href, title: mark.text })),
    native: { ...role, grouped, company: parent.title },
  };
};
/** Unknown cards refuse the export; dateless nested fragments never become jobs. */
export const linkedinExperienceDocument = (raw, options, capturedAt) => {
  if (
    raw.url !== options.url ||
    !Array.isArray(raw.items) ||
    raw.items.length > 200 ||
    (!raw.items.length && !raw.empty) ||
    raw.items.some((item) => item.unparsed)
  ) {
    throw experienceDocumentFailure();
  }
  const jobs = raw.items.flatMap((item) => {
    const grouped = item.roles.length > 0;
    return (grouped ? item.roles : [item.parent]).map((role) =>
      jobFrom(item, role, grouped)
    );
  });
  return validateExperienceDocument({
    kind: 'cv-experience',
    version: 1,
    platform: 'linkedin',
    source: {
      id: new URL(options.url).pathname.split('/')[2],
      url: options.url,
      language: options.language,
      capturedAt,
    },
    profile: {
      language: raw.language,
      acquisition: 'rendered-experience-page',
    },
    jobs,
  });
};
