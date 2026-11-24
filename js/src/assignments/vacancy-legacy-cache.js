import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { defaultStoreDir } from '../storage/app-directory.js';
import { saveAcknowledgedRecord } from '../storage/acknowledged-record.js';
import { modelFingerprint } from '../automation/answer-model-context.js';
import { readPrivateFormSource as readPrivateSource } from '../forms/private-source.js';
import {
  LEGACY_VACANCY_BYTES,
  legacyVacancyContent,
} from './vacancy-legacy-content.js';
import { saveAbsentLegacyVacancy } from './vacancy-legacy-write.js';

const sources = new WeakMap();
const pending = new WeakMap();
const failure = () =>
  Object.assign(new Error('Review the private legacy vacancy cache.'), {
    code: 'jobs-vacancy-cache-import',
  });
const trace = (stage, error) => {
  if (process.env.MS_JOBS_CACHE_DEBUG === '1') {
    console.error(
      '[jobs-vacancy-cache]',
      JSON.stringify({
        stage,
        error: error.name,
        code: error.code ?? null,
      })
    );
  }
};

/** A server-side dependency, never a request-selected host path. */
export const configureLegacyVacancies = (store, directories) => {
  if (directories !== undefined) {
    if (
      !Array.isArray(directories) ||
      directories.length > 3 ||
      directories.some((directory) => !path.isAbsolute(directory))
    ) {
      throw failure();
    }
    const selected = [...new Set(directories)];
    if (
      pending.has(store) &&
      JSON.stringify(sources.get(store)) !== JSON.stringify(selected)
    ) {
      throw failure();
    }
    sources.set(store, selected);
  }
};

const defaultSources = (store) => {
  if (typeof store.logFile !== 'string' || !path.isAbsolute(store.logFile)) {
    return [];
  }
  const selected = path.dirname(store.logFile);
  // Explicit stores do not silently import another workspace's private data.
  const directories = [path.join(selected, 'vacancies')];
  if (path.resolve(selected) === path.resolve(defaultStoreDir())) {
    directories.push(
      process.env.VACANCY_CACHE_DIR
        ? path.resolve(process.env.VACANCY_CACHE_DIR)
        : path.join(os.homedir(), '.hh-automation', 'vacancies'),
      path.join(process.cwd(), 'data', 'vacancies')
    );
  }
  return [...new Set(directories)];
};

const importRecord = async (store, directory, name, result) => {
  const legacyId = `vacancy-legacy:${await modelFingerprint([directory, name])}`;
  const previous = await store.get(legacyId);
  if (previous?.complete === true) {
    result.existing++;
    return;
  }
  let source, text, content;
  let stage = 'read';
  try {
    source = await readPrivateSource(
      directory,
      name,
      LEGACY_VACANCY_BYTES,
      failure
    );
    if (!source) {
      return;
    }
    stage = 'decode';
    text = new TextDecoder('utf-8', { fatal: true }).decode(source.data);
    stage = 'parse';
    content = legacyVacancyContent(text, name.slice(0, -5), source.updatedAt);
  } catch (error) {
    trace(stage, error);
    result.invalid.push(name);
    return;
  }
  const id = `assignment-vacancy:${await modelFingerprint(content.url)}`;
  // Retain every field, exact quoting and whitespace, including older fields
  // the current projection does not interpret. Originals are never changed.
  const original = {
    id: legacyId,
    version: 1,
    tokens: ['vacancy', 'legacy'],
    children: [],
    file: name,
    text,
    sha256: source.sha256,
    vacancyId: id,
    complete: false,
  };
  await saveAcknowledgedRecord(store, original);
  if (
    await saveAbsentLegacyVacancy(store, {
      id,
      version: 1,
      tokens: ['assignment', 'vacancy'],
      children: [],
      ...content,
    })
  ) {
    result.imported++;
  } else {
    result.existing++;
  }
  // Only an acknowledged completion prevents reimport after a later deletion.
  await saveAcknowledgedRecord(store, { ...original, complete: true });
};

const migrate = async (store, directories) => {
  const result = { imported: 0, existing: 0, invalid: [] };
  let files = 0;
  for (const directory of directories) {
    let handle;
    try {
      const stat = await fs.lstat(directory);
      if (!stat.isDirectory()) {
        throw failure();
      }
      // macOS /var and Windows short paths can name a canonical ancestor.
      // Compare contained files and fingerprint originals in that same space.
      const canonical = await fs.realpath(directory);
      handle = await fs.opendir(canonical);
      for await (const entry of handle) {
        if (!/^\d{1,20}\.lino$/u.test(entry.name)) {
          continue;
        }
        if (++files > 10000) {
          throw failure();
        }
        await importRecord(store, canonical, entry.name, result);
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        trace('directory', error);
        throw failure();
      }
    } finally {
      await handle?.close().catch((error) => {
        if (error.code !== 'ERR_DIR_CLOSED') {
          throw error;
        }
      });
    }
  }
  if (process.env.MS_JOBS_CACHE_DEBUG === '1') {
    console.error(
      '[jobs-vacancy-cache]',
      JSON.stringify({
        imported: result.imported,
        existing: result.existing,
        invalid: result.invalid.length,
      })
    );
  }
  return files ? { cacheMigration: result } : {};
};

/** One sequential pass per opened store; failed persistence remains retryable. */
export const ensureLegacyVacancies = (store) => {
  if (!pending.has(store)) {
    const task = migrate(store, sources.get(store) ?? defaultSources(store));
    pending.set(store, task);
    task.catch(() => {
      if (pending.get(store) === task) {
        pending.delete(store);
      }
    });
  }
  return pending.get(store);
};
