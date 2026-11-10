// Owner-selected sources produce drafts, never approvals or stored changes.
import { cvFromLino } from '../cv/model.js';
import { normalizeAnswerProfile } from './question-profile.js';
import { debugQuestionTurn } from './question-turns.js';

const MAX_TEXT = 64000;
const CV_ID = /^cv:[a-zA-Z0-9][a-zA-Z0-9_.-]{0,79}$/u;
const capturedAt = (link) =>
  typeof link.capturedAt === 'string' && link.capturedAt.length <= 80
    ? link.capturedAt
    : null;
const labels = {
  name: ['name', 'full name', 'имя', 'фио', 'नाम', '姓名'],
  email: ['email', 'e-mail', 'почта', 'электронная почта', 'ईमेल', '邮箱'],
  phone: ['phone', 'telephone', 'телефон', 'फ़ोन', 'फोन', '电话'],
  telegram: ['telegram', 'телеграм', 'टेलीग्राम', '电报'],
  linkedin: ['linkedin'],
  location: [
    'location',
    'city',
    'город',
    'местоположение',
    'शहर',
    '所在地',
    '城市',
  ],
  website: ['website', 'portfolio', 'сайт', 'портфолио', 'वेबसाइट', '网站'],
  headline: ['headline', 'profession', 'профессия', 'पेशा', '职业'],
  summary: ['summary', 'about', 'о себе', 'परिचय', '简介'],
};
const keyForLabel = (label) =>
  Object.entries(labels).find(([, names]) =>
    names.includes(label.toLowerCase().trim())
  )?.[0];

const publicUrl = (value) => {
  try {
    const url = new URL(value);
    const pathname = decodeURIComponent(url.pathname);
    return ['https:', 'http:'].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      !/\/(?:private|invite|joinchat)(?:\/|$)|^\/\+/iu.test(pathname) &&
      !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
      ? url
      : null;
  } catch {
    return null;
  }
};
const validValue = (key, value) => {
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
  return ['website', 'linkedin', 'telegram'].includes(key)
    ? validContactUrl(key, value)
    : true;
};

const validContactUrl = (key, value) => {
  if (key === 'telegram' && /^@[a-zA-Z][a-zA-Z0-9_]{4,31}$/u.test(value)) {
    return true;
  }
  const url = publicUrl(value);
  if (!url) {
    return false;
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
    const value = typeof raw === 'string' ? raw.trim() : '';
    if (!value || value.length > 2000 || !validValue(key, value)) {
      skipped.push({ key, evidence, reason: 'invalid-or-private' });
      return;
    }
    const candidates = values.get(key) ?? [];
    const existing = candidates.find((entry) => entry.value === value);
    if (existing) {
      existing.evidence.push(evidence);
    } else {
      if (candidates.length >= 20) {
        throw new Error('profile source has more than 20 variants per field');
      }
      candidates.push({ value, evidence: [evidence] });
    }
    values.set(key, candidates);
  };
  return { values, skipped, add };
};

const fromText = (text, add) => {
  for (const [index, line] of text.split(/\r?\n/u).entries()) {
    const labeled = line.match(/^\s*([^:：=]{1,50})\s*[:：=]\s*(.+)$/u);
    const evidence = { source: 'text', path: `line:${index + 1}` };
    const key = labeled && keyForLabel(labeled[1]);
    if (key) {
      add(key, labeled[2], evidence);
      continue;
    }
    for (const token of line.split(/[\s<>;,]+/u)) {
      const value = token.replace(/[),.;]+$/u, '');
      if (/^[^@]+@[^@]+\.[^@]+$/u.test(value)) {
        add('email', value, evidence);
      }
      const host = publicUrl(value)?.hostname ?? '';
      if (/^(?:www\.)?linkedin\.com$/iu.test(host)) {
        add('linkedin', value, evidence);
      }
      if (/^(?:www\.)?(?:t\.me|telegram\.me)$/iu.test(host)) {
        add('telegram', value, evidence);
      }
    }
  }
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
  ]) {
    add(key, cv.basics?.[key], evidence(`basics.${key}`));
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

export const extractAnswerProfile = async (store, input = {}) => {
  const profile = normalizeAnswerProfile(input.profile);
  const text = input.text ?? '';
  const cvId = input.cvId ?? '';
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
  const { values, skipped, add } = collector();
  if (cvId) {
    const link = await store.get(cvId);
    if (!link || link.id !== cvId) {
      throw new Error('selected CV snapshot is unavailable');
    }
    fromCv(link, add);
  }
  fromText(text, add);
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

const cvLinks = (cv, add, evidence) => {
  if (cv.links !== undefined) {
    if (!Array.isArray(cv.links) || cv.links.length > 100) {
      throw new Error('CV links must contain at most 100 entries');
    }
    for (const [index, entry] of cv.links.entries()) {
      const host = publicUrl(entry?.url)?.hostname ?? '';
      const key = /^(?:www\.)?linkedin\.com$/iu.test(host)
        ? 'linkedin'
        : /^(?:www\.)?(?:t\.me|telegram\.me)$/iu.test(host)
          ? 'telegram'
          : 'website';
      add(key, entry?.url, evidence(`links.${index}.url`));
    }
  }
};
