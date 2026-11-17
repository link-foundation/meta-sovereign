import path from 'node:path';
import { formatIndented } from 'lino-objects-codec';
import { readReadableConfiguration } from './readable-configuration.js';
import { runnerProfileData, validateRunnerProfile } from './runner-profile.js';

const invalid = () => new Error('Runner profile unavailable or invalid.');

const readLayer = async (file, optional) => {
  try {
    return {
      value: validateRunnerProfile(await readReadableConfiguration(file), {
        partial: true,
      }),
      exists: true,
    };
  } catch (error) {
    if (optional && error.code === 'ENOENT') {
      return { value: {}, exists: false };
    }
    throw invalid();
  }
};

/** Validate every layer, including values hidden by a later override. */
export const mergeRunnerConfiguration = (...layers) => {
  let merged = {};
  for (const layer of layers) {
    const value = validateRunnerProfile(layer, { partial: true });
    const previous = merged;
    merged = { ...previous, ...value };
    for (const mode of ['local', 'server']) {
      if (value[mode] === false) {
        delete merged[mode];
      } else if (value[mode] !== undefined) {
        merged[mode] = { ...previous[mode], ...value[mode] };
      }
    }
  }
  return validateRunnerProfile(merged);
};

/** Local fields override global fields. Reads never persist or launch anything. */
export const readRunnerConfiguration = async (
  file,
  { localFile, optional = false, overrides = {} } = {}
) => {
  const global = await readLayer(file, optional);
  const local =
    localFile && path.resolve(localFile) !== path.resolve(file)
      ? await readLayer(localFile, true)
      : { value: {}, exists: false };
  return {
    targets: mergeRunnerConfiguration(global.value, local.value, overrides),
    // Preserve the existing per-user editor unless an app-folder file exists.
    file: local.exists ? localFile : file,
    encode: local.exists
      ? (targets) => {
          const value = runnerProfileData(targets);
          for (const mode of ['local', 'server']) {
            if (global.value[mode] && !targets[mode]) {
              value[mode] = false;
            }
          }
          return formatIndented({ id: 'runner', obj: value });
        }
      : undefined,
  };
};

export const runnerOverrideOptions = new Set([
  'session',
  ...['local', 'server'].flatMap((mode) =>
    [
      'directory',
      'cli',
      'store',
      'port',
      'isolation',
      'start',
      'node',
      ...(mode === 'server' ? ['host'] : []),
    ].map((field) => `${mode}-${field}`)
  ),
]);

/** Explicit, credential-free command values; never modify files or process env. */
export const runnerConfigurationOverrides = (args) => {
  const value = {};
  for (const option of runnerOverrideOptions) {
    if (args[option] === undefined) {
      continue;
    }
    const supplied = args[option];
    if (typeof supplied !== 'string' || !supplied) {
      throw invalid();
    }
    if (option === 'session') {
      value.session = supplied;
      continue;
    }
    const [mode, field] = option.split('-');
    value[mode] ??= {};
    if (field === 'port' && !/^\d{1,5}$/.test(supplied)) {
      throw invalid();
    }
    value[mode][field] = field === 'port' ? Number(supplied) : supplied;
  }
  return validateRunnerProfile(value, { partial: true });
};
