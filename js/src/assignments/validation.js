import { formFailure, formUrl } from '../forms/options.js';
export const assignmentFailure = (code, message) =>
  formFailure(`assignment-${code}`, message);
export const assignmentText = (value, maximum, label, empty = false) => {
  if (
    typeof value !== 'string' ||
    value.length > maximum ||
    (!empty && !value.trim()) ||
    /\p{Cc}/u.test(value.replace(/[\n\r\t]/gu, ''))
  ) {
    throw assignmentFailure('input', `Invalid ${label}.`);
  }
  return value.trim();
};
export const assignmentVacancy = (value = {}) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw assignmentFailure('input', 'Use a vacancy snapshot.');
  }
  const skills = value.skills ?? [];
  if (!Array.isArray(skills) || skills.length > 100) {
    throw assignmentFailure('input', 'Invalid vacancy skills.');
  }
  return {
    title: assignmentText(value.title ?? '', 500, 'vacancy title', true),
    description: assignmentText(
      value.description ?? '',
      30000,
      'vacancy description',
      true
    ),
    company: assignmentText(value.company ?? '', 500, 'employer', true),
    skills: skills.map((skill) => assignmentText(skill, 200, 'vacancy skill')),
  };
};
export const assignmentTarget = (value) => {
  if (
    typeof value !== 'string' ||
    !/^[a-zA-Z0-9][a-zA-Z0-9-]{0,38}\/[a-zA-Z0-9][a-zA-Z0-9_.-]{0,99}$/u.test(
      value
    ) ||
    value.endsWith('.git')
  ) {
    throw assignmentFailure('target', 'Use owner/repository for the target.');
  }
  return value;
};

export const assignmentVacancyUrl = (value) => {
  let url;
  try {
    url = new URL(value);
  } catch {
    /* rejected below */
  }
  if (
    !url ||
    url.protocol !== 'https:' ||
    url.port ||
    url.username ||
    url.password ||
    !(url.hostname === 'hh.ru' || url.hostname.endsWith('.hh.ru')) ||
    !/^\/vacancy\/\d{1,20}\/?$/u.test(url.pathname)
  ) {
    throw assignmentFailure('vacancy-url', 'Use an HTTPS hh.ru vacancy URL.');
  }
  return `https://hh.ru/vacancy/${url.pathname.split('/')[2]}`;
};

export const assignmentSourceUrl = (value) => {
  try {
    const url = new URL(formUrl(value));
    if (url.href.length > 4000) {
      throw new Error('limit');
    }
    url.hash = '';
    return url.href;
  } catch {
    throw assignmentFailure(
      'source-url',
      'Use an HTTP or HTTPS instruction URL without credentials.'
    );
  }
};
