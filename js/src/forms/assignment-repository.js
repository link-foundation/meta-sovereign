import { formFailure } from './options.js';

export const assignmentRepositoryConfirmed = (repository, name) =>
  Number.isSafeInteger(repository?.id) &&
  repository.id > 0 &&
  typeof repository.fullName === 'string' &&
  repository.fullName.toLowerCase() === name.toLowerCase() &&
  typeof repository.url === 'string' &&
  repository.url.toLowerCase() === `https://github.com/${name.toLowerCase()}` &&
  Number.isFinite(Date.parse(repository.verifiedAt));

export const assignmentRepositoryName = (value) => {
  let url;
  try {
    url = new URL(value);
  } catch {
    /* rejected below */
  }
  const parts = url?.pathname.split('/').filter(Boolean) ?? [];
  if (
    !url ||
    url.protocol !== 'https:' ||
    url.hostname !== 'github.com' ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    parts.length !== 2 ||
    !parts.every((part) => /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,99}$/u.test(part)) ||
    parts[1].endsWith('.git')
  ) {
    throw formFailure(
      'form-assignment-repository',
      'Use an HTTPS GitHub repository URL.'
    );
  }
  return parts.join('/');
};

export const assignmentRepositoryReceipt = (result, name, now) => {
  if (
    !Number.isSafeInteger(result?.id) ||
    result.id <= 0 ||
    result.full_name?.toLowerCase() !== name.toLowerCase() ||
    assignmentRepositoryName(result.html_url).toLowerCase() !==
      name.toLowerCase()
  ) {
    throw formFailure(
      'form-assignment-unverified',
      'GitHub did not confirm the requested repository identity.'
    );
  }
  return {
    id: result.id,
    fullName: result.full_name,
    url: `https://github.com/${result.full_name}`,
    verifiedAt: new Date(now()).toISOString(),
  };
};
