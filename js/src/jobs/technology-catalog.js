import { assignmentText } from '../assignments/validation.js';
import { modelFingerprint } from '../automation/answer-model-context.js';
import { jobsFailure } from './options.js';

const defaults = [
  ['JavaScript', ['JS']],
  ['TypeScript', ['TS']],
  ['Node.js', ['NodeJS']],
  ['Python', []],
  ['Java', []],
  ['C++', []],
  ['C#', []],
  ['PHP', []],
  ['PHP 8', []],
  ['Go', ['GO', 'Golang', 'golang'], true],
  ['BASIC', ['Basic'], true],
  ['React', ['React.js', 'ReactJS']],
  ['React Native', []],
  ['Vue.js', ['Vue', 'VueJS']],
  ['Angular', []],
  ['.NET', []],
  ['.NET Core', []],
  ['.NET Framework', []],
  ['PostgreSQL', ['Postgres']],
  ['SQL', []],
  ['MySQL', []],
  ['Redis', []],
  ['Docker', []],
  ['Kubernetes', ['k8s']],
  ['Git', []],
  ['GitHub', []],
  ['Linux', []],
  ['CI/CD', ['CI CD']],
  ['HTML', []],
  ['HTML5', []],
  ['CSS', []],
  ['CSS3', []],
  ['npm', ['NPM'], true],
  ['Nginx Proxy Manager', ['NPM'], true],
].map(([canonical, aliases, caseSensitive = false]) => ({
  canonical,
  aliases,
  caseSensitive,
}));

export const technologyFailure = (kind = 'input') =>
  jobsFailure(
    `technology-${kind}`,
    'Technology analysis was not confirmed. Saved evidence is retained.'
  );
export const technologyName = (value) => {
  const name = assignmentText(value, 80, 'technology name');
  if (/[\n\r\t]/u.test(name)) {
    throw technologyFailure();
  }
  return name;
};
export const technologyCatalogEntries = (input) => {
  if (!Array.isArray(input) || input.length > 256) {
    throw technologyFailure();
  }
  const entries = input
    .map((row) => {
      if (
        !row ||
        !Array.isArray(row.aliases) ||
        row.aliases.length > 8 ||
        typeof row.caseSensitive !== 'boolean'
      ) {
        throw technologyFailure();
      }
      return {
        canonical: technologyName(row.canonical),
        aliases: [...new Set(row.aliases.map(technologyName))],
        caseSensitive: row.caseSensitive,
      };
    })
    .sort((a, b) => a.canonical.localeCompare(b.canonical, 'en'));
  if (
    new Set(entries.map((row) => row.canonical.toLowerCase())).size !==
    entries.length
  ) {
    throw technologyFailure();
  }
  return entries;
};
export const defaultTechnologyEntries = () =>
  technologyCatalogEntries(defaults);
export const technologyCatalog = async (entries) => {
  const normalized = technologyCatalogEntries(entries);
  return { revision: await modelFingerprint(normalized), entries: normalized };
};
export const storedTechnologyCatalog = async (store) => {
  const row = await store.get('jobs-technology-catalog');
  if (!row) {
    return technologyCatalog(defaults);
  }
  const catalog = await technologyCatalog(row.entries);
  if (row.version !== 1 || catalog.revision !== row.revision) {
    throw technologyFailure('catalog');
  }
  return catalog;
};
export const saveTechnologyCatalog = async (store, input) => {
  const old = await store.get('jobs-technology-catalog');
  const current = await storedTechnologyCatalog(store);
  if (input.revision !== current.revision) {
    throw technologyFailure('conflict');
  }
  const catalog = await technologyCatalog(input.entries);
  await store.put({ id: 'jobs-technology-catalog', version: 1, ...catalog });
  try {
    await store.flush?.();
  } catch (error) {
    await store.put(
      old ?? { id: 'jobs-technology-catalog', version: 1, ...current }
    );
    throw error;
  }
  return catalog;
};
