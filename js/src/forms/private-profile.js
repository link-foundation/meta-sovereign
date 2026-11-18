// Private reference-compatible defaults belong to the selected store, never cwd.
import { promises as fs, constants } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { extractAnswerProfile } from '../automation/question-profile-source.js';
import { normalizeAnswerProfile } from '../automation/question-profile.js';
import { prepareAnswerPreview } from '../automation/question-store.js';
import { formFailure } from './options.js';

const MAX_BYTES = 256000;
const sources = [
  ['resume/resume.md', 'resume-markdown'],
  ['contacts.lino', 'contacts-lino'],
  ['profile.lino', 'contacts-lino'],
];
const aliases = {
  full_name: 'name',
  fullName: 'name',
  first_name: 'firstName',
  last_name: 'lastName',
  middle_name: 'middleName',
  city: 'location',
};
const sourceFailure = (name) =>
  formFailure(
    'form-profile-source',
    `Review the private ${name} source; use a regular UTF-8 file of at most 64000 characters and 256000 bytes.`
  );

const readSource = async (directory, name) => {
  const file = path.join(directory, name);
  let handle;
  try {
    const stat = await fs.lstat(file);
    const parent = await fs.realpath(path.dirname(file));
    const relative = path.relative(directory, parent);
    if (
      !stat.isFile() ||
      stat.size > MAX_BYTES ||
      path.isAbsolute(relative) ||
      relative.split(path.sep).includes('..')
    ) {
      throw sourceFailure(name);
    }
    handle = await fs.open(
      file,
      constants.O_RDONLY | constants.O_NONBLOCK | (constants.O_NOFOLLOW ?? 0)
    );
    const opened = await handle.stat();
    if (!opened.isFile() || opened.size > MAX_BYTES) {
      throw sourceFailure(name);
    }
    const bytes = Buffer.alloc(MAX_BYTES + 1);
    let length = 0;
    while (length < bytes.length) {
      const { bytesRead } = await handle.read(
        bytes,
        length,
        bytes.length - length,
        null
      );
      if (!bytesRead) {
        break;
      }
      length += bytesRead;
    }
    if (length > MAX_BYTES) {
      throw sourceFailure(name);
    }
    const data = bytes.subarray(0, length);
    const text = new TextDecoder('utf-8', { fatal: true }).decode(data);
    if (text.length > 64000) {
      throw sourceFailure(name);
    }
    return { text, sha256: createHash('sha256').update(data).digest('hex') };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw sourceFailure(name);
  } finally {
    await handle?.close();
  }
};

const canonicalValues = (profile) => {
  const values = { ...profile };
  for (const [legacy, canonical] of Object.entries(aliases)) {
    if (Object.hasOwn(values, legacy)) {
      // Conflicting spellings in one file need owner correction, not a guess.
      if (
        Object.hasOwn(values, canonical) &&
        values[canonical] !== values[legacy]
      ) {
        throw new Error('conflicting contact aliases');
      }
      values[canonical] = values[legacy];
      delete values[legacy];
    }
  }
  return normalizeAnswerProfile(values);
};

export const readPrivateFormProfile = async (store) => {
  if (typeof store?.logFile !== 'string' || !store.logFile) {
    return { profile: {}, files: [] };
  }
  let directory;
  try {
    directory = await fs.realpath(path.dirname(store.logFile));
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { profile: {}, files: [] };
    }
    throw sourceFailure('profile directory');
  }
  const profile = {};
  const files = [];
  // Reference precedence: resume < canonical contacts < profile overrides.
  for (const [name, format] of sources) {
    const source = await readSource(directory, name);
    if (!source) {
      continue;
    }
    try {
      const extracted = source.text.trim()
        ? await extractAnswerProfile(store, {
            text: source.text,
            format,
            contactProfile: {
              ...Object.fromEntries(
                Object.entries(aliases)
                  .filter(([, canonical]) => Object.hasOwn(profile, canonical))
                  .map(([legacy, canonical]) => [legacy, profile[canonical]])
              ),
              ...profile,
            },
          })
        : { profile: {}, fields: [], skipped: [] };
      const values = canonicalValues(extracted.profile);
      for (const field of [
        ...extracted.fields.filter((entry) => entry.conflict),
        ...extracted.skipped,
      ]) {
        if (typeof field.key === 'string') {
          delete profile[aliases[field.key] ?? field.key];
        }
      }
      Object.assign(profile, values);
      normalizeAnswerProfile(profile);
      files.push({
        source: name,
        sha256: source.sha256,
        keys: Object.keys(values).sort(),
        conflicts: extracted.fields
          .filter((field) => field.conflict)
          .map((field) => field.key),
        skipped: extracted.skipped.length,
      });
    } catch {
      throw sourceFailure(name);
    }
  }
  return { profile, files };
};

/** The same defaults serve CLI, HTTP, reviewed fills and detached learning. */
export const prepareFormAnswerPreview = async (store, input, options) => {
  const prepared = await prepareAnswerPreview(store, input, options);
  const defaults = await readPrivateFormProfile(store);
  if (defaults.files.length) {
    prepared.context.profile = normalizeAnswerProfile({
      ...defaults.profile,
      ...prepared.context.profile,
    });
    prepared.context.profileSource = {
      ...prepared.context.profileSource,
      privateFiles: defaults.files,
    };
  }
  return prepared;
};

export const checkPrivateFormProfile = async (store, context) => {
  const current = await readPrivateFormProfile(store);
  if (
    JSON.stringify(current.files) !==
    JSON.stringify(context.profileSource?.privateFiles ?? [])
  ) {
    throw formFailure(
      'form-profile-changed',
      'Private contacts changed during learning. Observe the current answers again.'
    );
  }
};
