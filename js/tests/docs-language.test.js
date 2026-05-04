import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);

const languages = ['en', 'zh', 'hi', 'ru'];

const localizedDocGroups = [
  'README.md',
  'CHANGELOG.md',
  'mobile/README.md',
  'docs/BEST-PRACTICES.md',
  'docs/CONTRIBUTING.md',
  'docs/REQUIREMENTS.md',
  'docs/ROADMAP.md',
  'docs/SERVER-PARITY.md',
  'docs/UI-DESIGN-AUDIT.md',
  'docs/USER-GUIDE.md',
  'docs/WEBRTC-TURN.md',
  'docs/case-studies/issue-18/README.md',
  'docs/case-studies/issue-18/components.md',
  'docs/case-studies/issue-18/external-research.md',
  'docs/case-studies/issue-18/requirements.md',
  'docs/case-studies/issue-18/solution-plan.md',
];

const localizedPath = (englishPath, language) => {
  if (language === 'en') {
    return englishPath;
  }
  return englishPath.replace(/\.md$/, `.${language}.md`);
};

const expectedLinkTarget = (englishPath, language) =>
  path.posix.basename(localizedPath(englishPath, language));

const readDoc = async (relativePath) =>
  fs.readFile(path.join(repoRoot, relativePath), 'utf8');

const parseSwitcher = (firstLine, docPath) => {
  const match = firstLine.match(/\(languages:\s*(.+)\)$/);
  assert.ok(match, `${docPath} H1 must include a language switcher`);
  return match[1].split(/\s*•\s*/);
};

const assertSwitcher = ({ firstLine, englishPath, docPath, active }) => {
  assert.ok(firstLine.startsWith('# '), `${docPath} must start with an H1`);
  const entries = parseSwitcher(firstLine, docPath);
  assert.equal(
    entries.length,
    languages.length,
    `${docPath} switcher must list every supported language`
  );

  for (const [index, language] of languages.entries()) {
    const entry = entries[index];
    if (language === active) {
      assert.equal(
        entry,
        language,
        `${docPath} must render the active ${language} language as plain text`
      );
      continue;
    }

    const link = entry.match(/^\[([a-z]+)\]\(([^)]+)\)$/);
    assert.ok(link, `${docPath} ${language} entry must be a Markdown link`);
    assert.equal(
      link[1],
      language,
      `${docPath} link label must be ${language}`
    );
    assert.equal(
      link[2],
      expectedLinkTarget(englishPath, language),
      `${docPath} ${language} link must point at its sibling file`
    );
  }
};

test('tracked user-facing Markdown docs have four localized siblings with hive-mind switchers', async () => {
  for (const englishPath of localizedDocGroups) {
    for (const language of languages) {
      const docPath = localizedPath(englishPath, language);
      const contents = await readDoc(docPath);
      assert.ok(
        contents.trim().length > 100,
        `${docPath} must contain translated documentation, not just a heading`
      );
      const [firstLine] = contents.split(/\r?\n/);
      assertSwitcher({
        firstLine,
        englishPath,
        docPath,
        active: language,
      });
    }
  }
});

test('tracked localized Markdown switcher links resolve to existing siblings', async () => {
  for (const englishPath of localizedDocGroups) {
    for (const language of languages) {
      const docPath = localizedPath(englishPath, language);
      const contents = await readDoc(docPath);
      const [firstLine] = contents.split(/\r?\n/);
      const entries = parseSwitcher(firstLine, docPath);

      for (const entry of entries) {
        const link = entry.match(/^\[([a-z]+)\]\(([^)]+)\)$/);
        if (!link) {
          continue;
        }
        const target = path.join(path.dirname(docPath), link[2]);
        await fs.access(path.join(repoRoot, target));
      }
    }
  }
});
