import { open } from 'node:fs/promises';
import path from 'node:path';
import { parseIndented } from 'lino-objects-codec';
import { defaultStoreDir } from '../storage/app-directory.js';
import { MAX_RECOVERY_HOURS } from '../storage/recovery-settings.js';

const LIMIT = 64 * 1024;
const FIELDS = new Map([
  ['port', 'port'],
  ['verbose', 'verbose'],
  ['localUi', 'local-ui'],
  ['tls', 'tls'],
  ['jsonCompatibility', 'json-compatibility'],
  ['backupIntervalHours', 'backup-interval-hours'],
  ['backupKeep', 'backup-keep'],
  ['recoveryFormats', 'recovery-formats'],
  ['allowOrigin', 'allow-origin'],
  ['uiUrl', 'ui-url'],
]);
const invalid = (scope) =>
  Object.assign(new Error(`Invalid ${scope} application configuration.`), {
    code: 'INVALID_APP_CONFIGURATION',
  });
const record = (value) =>
  value && typeof value === 'object' && !Array.isArray(value);
const booleanFields = new Set([
  'verbose',
  'localUi',
  'tls',
  'jsonCompatibility',
]);
const integerWithin = (value, max) =>
  Number.isInteger(value) && value >= 0 && value <= max;
const publicUrl = (value, origin = false) => {
  if (typeof value !== 'string' || !value || value.length > 2048) {
    return false;
  }
  try {
    const url = new URL(value);
    return (
      (origin || /^https?:$/.test(url.protocol)) &&
      Boolean(url.host) &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      (!origin || ['', '/'].includes(url.pathname))
    );
  } catch {
    return false;
  }
};
const validField = (key, value) => {
  if (booleanFields.has(key)) {
    return typeof value === 'boolean';
  }
  if (key === 'port') {
    return integerWithin(value, 65535);
  }
  if (key === 'backupKeep') {
    return integerWithin(value, 10_000);
  }
  if (key === 'backupIntervalHours') {
    return Number.isFinite(value) && value >= 0 && value <= MAX_RECOVERY_HOURS;
  }
  if (key === 'recoveryFormats') {
    return ['text', 'binary', 'text,binary', 'binary,text', 'none'].includes(
      value
    );
  }
  if (key === 'uiUrl') {
    return publicUrl(value);
  }
  return (
    key === 'allowOrigin' &&
    typeof value === 'string' &&
    (value === 'none' ||
      (value.length <= 8192 &&
        value.split(/[,\s]+/).every((url) => publicUrl(url, true))))
  );
};

const validate = (value, scope) => {
  if (
    !record(value) ||
    Object.keys(value).some((key) => key !== 'server') ||
    (value.server !== undefined && !record(value.server))
  ) {
    throw invalid(scope);
  }
  for (const [key, item] of Object.entries(value.server ?? {})) {
    if (!FIELDS.has(key) || !validField(key, item)) {
      throw invalid(scope);
    }
  }
  return value.server ?? {};
};

const readLayer = async (file, scope, required = false) => {
  let handle;
  try {
    handle = await open(file, 'r');
    if (!(await handle.stat()).isFile()) {
      throw invalid(scope);
    }
    // Bound the actual read, including a file that grows after stat().
    const buffer = Buffer.alloc(LIMIT + 1);
    let size = 0;
    while (size < buffer.length) {
      const { bytesRead } = await handle.read(
        buffer,
        size,
        buffer.length - size
      );
      if (!bytesRead) {
        break;
      }
      size += bytesRead;
    }
    if (size > LIMIT) {
      throw invalid(scope);
    }
    const { obj } = parseIndented({
      text: buffer.subarray(0, size).toString('utf8'),
    });
    return validate(obj, scope);
  } catch (error) {
    if (error.code === 'ENOENT' && !required) {
      return {};
    }
    // Parser and filesystem errors can contain credentials or private paths.
    throw invalid(scope);
  } finally {
    await handle?.close();
  }
};

/** User config < local app-folder config < explicit CLI. No process env writes. */
export const startupArguments = async (
  args,
  {
    cwd = process.cwd(),
    globalDir = path.dirname(
      defaultStoreDir({ env: { ...process.env, META_SOVEREIGN_STORE_DIR: '' } })
    ),
    localDir = path.join(cwd, '.meta-sovereign'),
  } = {}
) => {
  if (
    args['app-config'] !== undefined &&
    (typeof args['app-config'] !== 'string' || !args['app-config'])
  ) {
    throw invalid('local');
  }
  const selected = args['app-config'] !== undefined;
  const globalFile = path.resolve(globalDir, 'config.lino');
  const localFile = selected
    ? path.resolve(cwd, args['app-config'])
    : path.resolve(localDir, 'config.lino');
  const global = await readLayer(
    globalFile,
    'global',
    selected && globalFile === localFile
  );
  const local =
    globalFile === localFile
      ? global
      : await readLayer(localFile, 'local', selected);
  const defaults = Object.fromEntries(
    Object.entries({ ...global, ...local }).map(([key, value]) => [
      FIELDS.get(key),
      value,
    ])
  );
  return { ...defaults, ...args };
};
