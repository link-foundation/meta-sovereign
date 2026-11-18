import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  createBrowserStore,
  createInMemoryDriver,
} from '../../js/src/storage/browser-store.js';
import { createVacancyService } from '../../js/src/jobs/service.js';

export const legacyVacancy = (changes = {}) => ({
  id: '123',
  url: 'https://hh.ru/vacancy/123?from=search',
  title: 'Python engineer',
  company: 'Fixture employer',
  description: 'Required: Python and SQL.\nPreferred: Rust.\nFinal paragraph.',
  descriptionHtml:
    ' <section><p>Python &amp; SQL</p>\n<p>Final paragraph.</p></section> ',
  skills: ['Python', 'SQL'],
  required: ['Python', 'SQL'],
  preferred: ['Rust'],
  firstSeenAt: '2026-11-01T00:00:00Z',
  lastSeenAt: '2026-11-02T00:00:00Z',
  status: 'encountered',
  extra: 'Older employer metadata is retained exactly.',
  ...changes,
});

export const legacyNotation = (value = legacyVacancy()) =>
  `${Object.entries(value)
    .map(
      ([key, item]) =>
        `${key}\n${[item]
          .flat()
          .map(
            (part) => `  ${`'${String(part || ' ').replaceAll("'", "''")}'`}`
          )
          .join('\n')}`
    )
    .join('\n')}\n`;

export const withLegacyVacancies = async (work, { driver } = {}) => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'ms-vacancy-legacy-')
  );
  const legacy = path.join(directory, 'vacancies');
  await fs.mkdir(legacy, { mode: 0o700 });
  const storage = driver ?? createInMemoryDriver();
  const opened = [];
  const open = async (options = {}) => {
    const { decorateStore = (value) => value, ...serviceOptions } = options;
    const baseStore = await createBrowserStore({ driver: storage });
    Object.defineProperty(baseStore, 'logFile', {
      value: path.join(directory, 'data.lino'),
    });
    const store = decorateStore(baseStore);
    const service = createVacancyService({
      store,
      readVacancy: () => assertNoProvider(),
      ...serviceOptions,
    });
    opened.push({ store, service });
    return { store, service };
  };
  try {
    return await work({
      directory,
      legacy,
      open,
      driver: storage,
      write: (name = '123.lino', text = legacyNotation()) =>
        fs.writeFile(path.join(legacy, name), text, { mode: 0o600 }),
    });
  } finally {
    for (const { store, service } of opened.reverse()) {
      await service.stop();
      await store.close();
    }
    await fs.rm(directory, { recursive: true, force: true });
  }
};

const assertNoProvider = () => {
  throw new Error('Migration must not read a provider.');
};
