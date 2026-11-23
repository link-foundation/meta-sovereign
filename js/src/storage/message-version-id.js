export const VERSION_PREFIX = 'message-version:';
export const messageVersionPrefix = (id) =>
  `${VERSION_PREFIX}${encodeURIComponent(id)}:`;
export const importMessageVersions = Symbol('importMessageVersions');
