import { resumePeriod } from '../jobs/resume-dates.js';
import { linkedinTextItem } from './linkedin-experience-text.js';
import { observedLinkedinPositionEditor } from './linkedin-position-editor-url.js';
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
const jobFrom = (item, role, grouped, url) => {
  const { parent } = item;
  const { positionEditor: _unverifiedEditor, ...native } = role;
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
    /\/details\/skills\/|\/skill-associations(?:-details)?\//u.test(mark.href)
  );
  const media = marks.filter((mark) => {
    try {
      const host = new URL(mark.href).hostname;
      return host !== 'linkedin.com' && !host.endsWith('.linkedin.com');
    } catch {
      return false;
    }
  });
  const positionEditor = observedLinkedinPositionEditor(
    role.editors,
    url,
    'update'
  );
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
    skills: [
      ...new Set([
        ...skills.map((mark) =>
          mark.text.replace(/^(?:skills|навыки):\s*/iu, '')
        ),
        ...(role.skills ?? []),
      ]),
    ],
    media: media.map((mark) => ({ url: mark.href, title: mark.text })),
    native: {
      ...native,
      grouped,
      company,
      ...(positionEditor && { positionEditor }),
    },
  };
};
const aboutValueValid = (about) =>
  about.observed
    ? typeof about.about === 'string' && about.about.length <= 24000
    : about.reason === 'section-not-rendered' && about.about === undefined;
const profileFrom = (raw, url) => {
  const about = raw.profileAbout;
  if (about === undefined) {
    return {};
  }
  const observed = about?.observed === true;
  if (
    !about ||
    about.url !== url.replace(/details\/experience\/$/u, '') ||
    typeof about.observed !== 'boolean' ||
    !Number.isInteger(about.passes) ||
    about.passes < 3 ||
    about.passes > 30 ||
    about.boundary !==
      (observed ? 'rendered-about-section' : 'rendered-bottom') ||
    !aboutValueValid(about)
  ) {
    throw experienceDocumentFailure();
  }
  return {
    aboutAcquisition: about,
    ...(observed ? { about: about.about } : {}),
  };
};
/** Unknown cards refuse the export; dateless nested fragments never become jobs. */
export const linkedinExperienceDocument = (raw, options, capturedAt) => {
  if (
    raw.url !== options.url ||
    !Array.isArray(raw.items) ||
    raw.items.length > 200 ||
    (!raw.items.length && !raw.empty) ||
    raw.items.some((item) => item.unparsed && !item.fallback)
  ) {
    throw experienceDocumentFailure();
  }
  const jobs = raw.items.flatMap((input) => {
    const item = input.fallback ? linkedinTextItem(input) : input;
    const grouped = item.roles.length > 0;
    return (grouped ? item.roles : [item.parent]).map((role) =>
      jobFrom(item, role, grouped, options.url)
    );
  });
  const editorIds = new Map();
  for (const { native } of jobs) {
    if (native.positionEditor) {
      const id = decodeURIComponent(
        new URL(native.positionEditor).pathname
          .replace(/\/$/u, '')
          .split('/')
          .at(-1)
      );
      const positions = editorIds.get(id) ?? [];
      positions.push(native);
      editorIds.set(id, positions);
    }
  }
  for (const positions of editorIds.values()) {
    if (positions.length > 1) {
      positions.forEach((native) => delete native.positionEditor);
    }
  }
  const positionEditor = observedLinkedinPositionEditor(
    raw.addEditors,
    options.url,
    'add'
  );
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
      ...profileFrom(raw, options.url),
      ...(positionEditor && { positionEditor }),
    },
    jobs,
  });
};
