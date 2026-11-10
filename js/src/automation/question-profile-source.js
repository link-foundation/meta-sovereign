// Owner-selected sources produce drafts, never approvals or stored changes.
import { cvFromLino } from '../cv/model.js';
import { normalizeAnswerProfile } from './question-profile.js';
import { debugQuestionTurn } from './question-turns.js';
import { fromLegacyContacts } from './question-profile-legacy.js';
import { fromProfileText, profileLabelKey } from './question-profile-text.js';
import {
  publicProfileUrl as publicUrl,
  profileUrlKey,
  profileBirthDate,
  collectProfileGithub,
} from './question-profile-contact-values.js';

const MAX_TEXT = 64000;
const CV_ID = /^cv:[a-zA-Z0-9][a-zA-Z0-9_.-]{0,79}$/u;
const capturedAt = (link) =>
  typeof link.capturedAt === 'string' && link.capturedAt.length <= 80
    ? link.capturedAt
    : null;
const validValue = (key, value) =>
  value.split('\n').every((line) => validSingleValue(key, line));
const validSingleValue = (key, value) => {
  if (
    /\{\{|\}\}/u.test(value) ||
    [...value].some(
      (char) =>
        char.codePointAt(0) < 32 && ![9, 10, 13].includes(char.codePointAt(0))
    )
  ) {
    return false;
  }
  for (const [url] of value.matchAll(/(?:https?|tg):\/\/[^\s<>]+/giu)) {
    if (!publicUrl(url)) {
      return false;
    }
  }
  if (key === 'email') {
    return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/u.test(value);
  }
  if (key === 'phone') {
    return (
      /^\+?[\d\s().-]+$/u.test(value) &&
      /^\d{7,15}$/u.test(value.replace(/\D/gu, ''))
    );
  }
  return ['website', 'linkedin', 'telegram', 'github', 'resume'].includes(key)
    ? validContactUrl(key, value)
    : true;
};

const validContactUrl = (key, value) => {
  if (key === 'telegram' && /^@[a-zA-Z][a-zA-Z0-9_]{4,31}$/u.test(value)) {
    return true;
  }
  const url = publicUrl(
    key === 'github' && !value.includes('://') ? `https://${value}` : value
  );
  if (!url) {
    return false;
  }
  if (key === 'github') {
    return profileUrlKey(url.href) === 'github';
  }
  if (key === 'linkedin') {
    return (
      /^(?:www\.)?linkedin\.com$/iu.test(url.hostname) &&
      /^\/in\/[^/]+\/?$/u.test(url.pathname)
    );
  }
  if (key === 'telegram') {
    return (
      /^(?:www\.)?(?:t\.me|telegram\.me)$/iu.test(url.hostname) &&
      /^\/[a-zA-Z][a-zA-Z0-9_]{4,31}\/?$/u.test(url.pathname)
    );
  }
  return true;
};

const collector = () => {
  const values = new Map();
  const skipped = [];
  const add = (key, raw, evidence) => {
    if (raw === undefined || raw === null || raw === '') {
      return;
    }
    const text = typeof raw === 'string' ? raw.trim() : '';
    const value = key === 'birthDate' ? profileBirthDate(text) : text;
    const sources = Array.isArray(evidence) ? evidence : [evidence];
    if (!value || value.length > 2000 || !validValue(key, value)) {
      skipped.push(
        ...sources.map((source) => ({
          key,
          evidence: source,
          reason: 'invalid-or-private',
        }))
      );
      return;
    }
    const candidates = values.get(key) ?? [];
    const existing = candidates.find((entry) => entry.value === value);
    if (existing) {
      existing.evidence.push(...sources);
    } else {
      if (candidates.length >= 20) {
        throw new Error('profile source has more than 20 variants per field');
      }
      candidates.push({ value, evidence: sources });
    }
    values.set(key, candidates);
  };
  return { values, skipped, add };
};

const fromCv = (link, add) => {
  let cv = link.cv;
  if (!cv && typeof link.lino === 'string' && link.lino.length <= MAX_TEXT) {
    cv = cvFromLino(link.lino);
  }
  if (!cv || typeof cv !== 'object' || Array.isArray(cv)) {
    throw new Error('selected CV has no readable canonical snapshot');
  }
  const evidence = (path) => ({
    source: link.id,
    path,
    capturedAt: capturedAt(link),
  });
  for (const key of [
    'name',
    'headline',
    'summary',
    'email',
    'phone',
    'location',
    'website',
    'birthDate',
  ]) {
    add(key, cv.basics?.[key], evidence(`basics.${key}`));
  }
  if (profileUrlKey(link.url) === 'resume') {
    add('resume', link.url, evidence('url'));
  }
  cvSkills(cv, add, evidence);
  cvLinks(cv, add, evidence);
};

export const listAnswerProfileSources = async (store) => {
  const sources = [];
  const add = (batch) => {
    for (const link of batch) {
      if (sources.length >= 50) {
        throw new Error('profile CV source limit (50) exceeded');
      }
      sources.push({
        id: link.id,
        capturedAt: capturedAt(link),
      });
    }
  };
  const select = (link) => CV_ID.test(link?.id ?? '');
  const project = (link) => ({ id: link.id, capturedAt: link.capturedAt });
  if (store.scan) {
    await store.scan(select, 50, add, project);
  } else {
    add((await store.query(select)).map(project));
  }
  return { sources: sources.sort((a, b) => a.id.localeCompare(b.id)) };
};

const sourceInput = (input) => {
  const text = input.text ?? '';
  const cvId = input.cvId ?? '';
  const format = input.format ?? 'text';
  if (!['text', 'contacts-lino', 'resume-markdown'].includes(format)) {
    throw new Error(
      'profile source format must be text, contacts-lino or resume-markdown'
    );
  }
  if (typeof text !== 'string' || text.length > MAX_TEXT) {
    throw new Error(
      'profile source text must contain at most 64000 characters'
    );
  }
  if (typeof cvId !== 'string' || (cvId && !CV_ID.test(cvId))) {
    throw new Error('select a stored cv: identifier');
  }
  if (!cvId && !text.trim()) {
    throw new Error('select a CV or provide owner contact text');
  }
  return { text, cvId, format };
};

export const extractAnswerProfile = async (store, input = {}) => {
  const profile = normalizeAnswerProfile(input.profile);
  const { text, cvId, format } = sourceInput(input);
  const { values, skipped, add } = collector();
  if (cvId) {
    const link = await store.get(cvId);
    if (!link || link.id !== cvId) {
      throw new Error('selected CV snapshot is unavailable');
    }
    fromCv(link, add);
  }
  if (format === 'contacts-lino') {
    fromLegacyContacts(text, add, skipped);
  } else {
    fromProfileText(text, add, format);
  }
  const fields = [...values].map(([key, candidates]) => {
    const current = profile[key];
    const conflict =
      candidates.length > 1 ||
      Boolean(current?.trim() && candidates.some((c) => c.value !== current));
    if (!conflict) {
      profile[key] = candidates[0].value;
    }
    return { key, candidates, current: current ?? null, conflict };
  });
  normalizeAnswerProfile(profile);
  debugQuestionTurn('profile-extracted', {
    fields: fields.length,
    conflicts: fields.filter((f) => f.conflict).length,
    skipped: skipped.length,
  });
  return { profile, fields, skipped, readOnly: true, requiresReview: true };
};

const cvSkills = (cv, add, evidence) => {
  if (cv.skills !== undefined) {
    if (!Array.isArray(cv.skills) || cv.skills.length > 100) {
      throw new Error('CV skills must contain at most 100 entries');
    }
    add(
      'skills',
      cv.skills.every((s) => typeof s === 'string' && s.length <= 2000)
        ? cv.skills.join('\n')
        : {},
      evidence('skills')
    );
  }
};

const cvLinkKey = (entry) => {
  const label = profileLabelKey(entry?.label);
  return ['github', 'linkedin', 'telegram', 'resume'].includes(label)
    ? label
    : (profileUrlKey(entry?.url) ?? 'website');
};

const cvLinks = (cv, add, evidence) => {
  if (cv.links !== undefined) {
    if (!Array.isArray(cv.links) || cv.links.length > 100) {
      throw new Error('CV links must contain at most 100 entries');
    }
    const github = collectProfileGithub(add);
    for (const [index, entry] of cv.links.entries()) {
      github.add(cvLinkKey(entry), entry?.url, evidence(`links.${index}.url`));
    }
    github.finish();
  }
};
