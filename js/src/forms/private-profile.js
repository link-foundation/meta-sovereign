// Private reference-compatible defaults belong to the selected store, never cwd.
import {
  privateFormDirectory,
  readPrivateFormSource,
} from './private-source.js';
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
  const source = await readPrivateFormSource(
    directory,
    name,
    MAX_BYTES,
    sourceFailure
  );
  if (!source) {
    return null;
  }
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(source.data);
    if (text.length > 64000) {
      throw sourceFailure(name);
    }
    return { text, sha256: source.sha256 };
  } catch {
    throw sourceFailure(name);
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
  const directory = await privateFormDirectory(store, sourceFailure);
  if (!directory) {
    return { profile: {}, files: [] };
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
