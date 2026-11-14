import { assignmentRepositoryName } from '../forms/assignment-repository.js';

export const HIVE_MIND_GUIDE =
  'https://github.com/link-assistant/hive-mind/blob/main/docs/CI-CD-BEST-PRACTICES.md';
export const ASSIGNMENT_LANGUAGES = {
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  rust: 'Rust',
  python: 'Python',
  go: 'Go',
  csharp: 'C#',
  java: 'Java',
  cpp: 'C++',
  php: 'PHP',
};
const prefixes = {
  javascript: 'js',
  typescript: 'js',
  rust: 'rust',
  python: 'python',
  go: 'go',
  csharp: 'csharp',
  java: 'java',
  cpp: 'cpp',
  php: 'php',
};
export const FALLBACK_ASSIGNMENT_TEMPLATES = Object.fromEntries(
  Object.entries(prefixes).map(([key, prefix]) => [
    key,
    `link-foundation/${prefix}-ai-driven-development-pipeline-template`,
  ])
);
const languageKeys = (cell) => {
  const special = { 'c#': ['csharp'], 'c/c++': ['cpp'], 'c++': ['cpp'] };
  return (
    special[cell.toLowerCase()] ??
    cell
      .toLowerCase()
      .split('/')
      .map((s) => s.trim())
  ).filter((key) => Object.hasOwn(ASSIGNMENT_LANGUAGES, key));
};

/** Only the named table is authoritative; later examples cannot replace it. */
export const parseAssignmentTemplates = (markdown) => {
  if (typeof markdown !== 'string' || markdown.length > 256 * 1024) {
    return {};
  }
  const lines = markdown.split('\n');
  const start = lines.findIndex((line) =>
    /^## Recommended CI\/CD Templates\s*$/u.test(line)
  );
  if (start < 0) {
    return {};
  }
  const result = {};
  for (const line of lines.slice(start + 1)) {
    if (/^#{1,2}\s/u.test(line)) {
      break;
    }
    if (line.length > 2000 || !line.startsWith('|')) {
      continue;
    }
    const cells = line.split('|').map((cell) => cell.trim());
    const url = cells[2]?.match(
      /^\[[^\]\n]+\]\((https:\/\/github\.com\/[^)\s]+)\)$/u
    )?.[1];
    if (!url) {
      continue;
    }
    try {
      const repository = assignmentRepositoryName(url);
      for (const key of languageKeys(cells[1])) {
        result[key] = repository;
      }
    } catch {
      // A malformed recommendation is unavailable, never an executable target.
    }
  }
  return result;
};

export const loadAssignmentTemplates = async (readGuide, signal) => {
  let current = {};
  try {
    current = parseAssignmentTemplates(await readGuide({ signal }));
  } catch {
    signal?.throwIfAborted();
  }
  return {
    guide: HIVE_MIND_GUIDE,
    source: Object.keys(current).length ? 'live' : 'fallback',
    repositories: { ...FALLBACK_ASSIGNMENT_TEMPLATES, ...current },
    fallbackLanguages: Object.keys(ASSIGNMENT_LANGUAGES).filter(
      (key) => !Object.hasOwn(current, key)
    ),
  };
};

const languagePatterns = {
  typescript: /\btypescript\b|\btype script\b/giu,
  javascript: /\bjavascript\b|\bnode\.?js\b/giu,
  rust: /\brust\b/giu,
  python: /\bpython\b/giu,
  go: /\bgolang\b|\bgo(?=\s+(?:developer|engineer|backend|разработ|программ))|\bgo(?=\s*[/,&])|(?:^|\n)go(?=\n|$)|\bна go\b/giu,
  csharp: /c#|\bdotnet\b|\.net\b/giu,
  java: /\bjava\b/giu,
  cpp: /c\+\+|\bcpp\b/giu,
  php: /\bphp\b/giu,
};
const languageCounts = (text) =>
  Object.entries(languagePatterns)
    .map(([language, pattern]) => [
      language,
      [...text.matchAll(pattern)].length,
    ])
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1]);
export const assignmentNamedLanguages = (vacancy) =>
  languageCounts(
    [vacancy.title, ...(vacancy.skills ?? []), vacancy.description].join('\n')
  ).map(([language]) => language);

/** The role title takes precedence over skills and incidental description text. */
export const assignmentPreferredLanguages = (vacancy) => {
  for (const text of [
    vacancy.title ?? '',
    (vacancy.skills ?? []).join('\n'),
    vacancy.description ?? '',
  ]) {
    const ranked = languageCounts(text);
    if (ranked.length) {
      return ranked
        .filter(([, count]) => count === ranked[0][1])
        .map(([language]) => language);
    }
  }
  return [];
};
