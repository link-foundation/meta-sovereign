import { readReadableConfiguration } from './readable-configuration.js';
import path from 'node:path';

const invalid = () => new Error('Runner profile unavailable or invalid.');
const record = (value) =>
  value && typeof value === 'object' && !Array.isArray(value);
const text = (value) =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= 2048 &&
  [...value].every(
    (char) => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127
  );
const fields = new Set([
  'directory',
  'cli',
  'store',
  'port',
  'host',
  'isolation',
  'start',
  'node',
]);
const hostValid = (host) =>
  typeof host === 'string' &&
  /^(?:[a-zA-Z0-9_][a-zA-Z0-9_.-]{0,63}@)?[a-zA-Z0-9][a-zA-Z0-9.-]{0,252}$/.test(
    host
  );
const optionalTextValid = (target) =>
  ['start', 'node'].every(
    (key) => target[key] === undefined || text(target[key])
  );
const pathsValid = (target, mode) =>
  ['directory', 'cli', 'store'].every(
    (key) =>
      text(target[key]) &&
      (mode === 'server' ? path.posix : path).isAbsolute(target[key])
  );
const addressValid = (target, mode) =>
  mode === 'server' ? hostValid(target.host) : target.host === undefined;
const validateTarget = (target, mode, session) => {
  if (
    !record(target) ||
    Object.keys(target).some((key) => !fields.has(key)) ||
    !pathsValid(target, mode) ||
    !Number.isInteger(target.port) ||
    target.port < 1 ||
    target.port > 65535 ||
    !optionalTextValid(target)
  ) {
    throw invalid();
  }
  if (!addressValid(target, mode)) {
    throw invalid();
  }
  const isolation = target.isolation ?? 'screen';
  if (isolation !== 'screen') {
    throw invalid();
  }
  return {
    ...target,
    isolation,
    session,
    start: target.start ?? '$',
    node: target.node ?? 'node',
  };
};

/** Profiles contain paths and an SSH address; credentials stay in protected stores. */
export const validateRunnerProfile = (value) => {
  if (
    !record(value) ||
    Object.keys(value).some(
      (key) => !['session', 'local', 'server'].includes(key)
    )
  ) {
    throw invalid();
  }
  const session = value.session ?? 'meta-sovereign-bot';
  if (
    typeof session !== 'string' ||
    !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}$/.test(session)
  ) {
    throw invalid();
  }
  const targets = {};
  for (const mode of ['local', 'server']) {
    if (value[mode] === undefined) {
      continue;
    }
    targets[mode] = validateTarget(value[mode], mode, session);
  }
  return targets;
};

/** Read at most 64 KiB, including growth after stat and nonregular-file refusal. */
export const readRunnerProfile = async (file, { optional = false } = {}) => {
  try {
    return validateRunnerProfile(await readReadableConfiguration(file));
  } catch (error) {
    if (optional && error.code === 'ENOENT') {
      return {};
    }
    throw invalid();
  }
};

/** Stable, credential-free binding retained before any process mutation. */
export const runnerProfileData = (targets) => {
  const profile = {
    session: Object.values(targets)[0]?.session ?? 'meta-sovereign-bot',
  };
  for (const mode of ['local', 'server']) {
    if (targets[mode]) {
      profile[mode] = Object.fromEntries(
        [...fields]
          .filter((key) => targets[mode][key] !== undefined)
          .map((key) => [key, targets[mode][key]])
      );
    }
  }
  return profile;
};
