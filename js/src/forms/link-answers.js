import { formLinkFields } from './profile-fields.js';

const providerHost = (hostname, domain) =>
  hostname === domain || hostname.endsWith(`.${domain}`);
const providerMatches = (hostname, keys) =>
  keys.includes('resume') ||
  keys.includes('website') ||
  (keys.includes('github') &&
    (providerHost(hostname, 'github.com') ||
      providerHost(hostname, 'github.io'))) ||
  (keys.includes('linkedin') && providerHost(hostname, 'linkedin.com'));
const validLink = (text, keys) => {
  try {
    const url = new URL(text.replace(/[,;]$/u, ''));
    return (
      ['http:', 'https:'].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      providerMatches(url.hostname, keys)
    );
  } catch {
    return false;
  }
};

/** Both saved answers and model drafts must satisfy the requested link subject. */
export const validFormLinkAnswer = (field, text) => {
  const keys = formLinkFields(field);
  return (
    !keys.length ||
    text
      .trim()
      .split(/\s+/u)
      .every((value) => validLink(value, keys))
  );
};
