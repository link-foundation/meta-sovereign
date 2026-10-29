// Offline CLI rehearsal: no credentials, network requests or published releases.
import { register } from 'command-stream';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const [scenario, statusText = '404', entryPath] = process.argv.slice(2);
const status = Number(statusText);
const directory = mkdtempSync(join(tmpdir(), 'ms-github-release-'));
const originalDirectory = process.cwd();
process.on('exit', () => {
  process.chdir(originalDirectory);
  rmSync(directory, { recursive: true, force: true });
});
process.chdir(directory);
const git = (...args) =>
  execFileSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
git('init', '-b', 'main');
git('config', 'user.name', 'Release fixture');
git('config', 'user.email', 'fixture@example.test');
git('config', 'commit.gpgsign', 'false');
git('config', 'core.autocrlf', 'false');
writeFileSync('package.json', '{"name":"fixture","version":"1.2.3"}');
const notes =
  scenario === 'notes-multi'
    ? '- abcdef123: First change\n\n- fedcba321: Second change'
    : scenario === 'notes-fenced'
      ? 'Example:\n\n```md\n- deadbeef: example, not a release commit\n```\n\n    - badc0de: indented example'
      : scenario === 'notes-large'
        ? '🙂'.repeat(16000)
        : '### Patch Changes\n\n- Keep `C:\\new` and quotes: "done"\n\n---\n\nMore detail.';
writeFileSync(
  'CHANGELOG.md',
  `# Fixture\n\n## 1.2.30\n\nWRONG VERSION\n\n## 1.2.3\n\n${notes}\n\n## 1.2.2\n\nOLD VERSION\n`
);
git('add', '.');
git('commit', '-m', 'Fixture release');
const sha = git('rev-parse', 'HEAD');
const release = { id: 123, tag_name: 'v1.2.3', assets: [], body: notes };
globalThis.fetch = async () => {
  console.log(`PROBE ${status}`);
  return { status, ok: status === 200, json: async () => release };
};
function prPages(args, pages) {
  return JSON.stringify(
    args.includes('--paginate') && args.includes('--slurp') ? pages : pages[0]
  );
}
function fixturePrLookup(args) {
  if (args[1].includes('deadbeef') || args[1].includes('badc0de')) {
    return { code: 1, stderr: 'HTTP 404: example is not a commit' };
  }
  return { code: 0, stdout: prPages(args, [[]]) };
}
register('gh', async ({ args, stdin }) => {
  console.log(`GH ${JSON.stringify(args)}`);
  if (args.includes('POST')) {
    const payload = JSON.parse(stdin);
    console.log(`PAYLOAD ${JSON.stringify(payload)}`);
    return payload.target_commitish === sha
      ? { code: 0, stdout: JSON.stringify(release) }
      : { code: 1, stderr: 'HTTP 422: invalid target_commitish' };
  }
  if (args.includes('PATCH')) {
    console.log(`PATCH ${stdin}`);
    return { code: 0, stdout: '{}' };
  }
  if (args[1]?.includes('/commits/')) {
    if (scenario === 'notes-refused') {
      return { code: 1, stderr: 'HTTP 403: refused' };
    }
    if (scenario === 'notes-multi') {
      const number = args[1].includes('abcdef123') ? 10 : 20;
      const prs = [
        { number: 99, title: 'chore: version packages' },
        { number, title: 'Actual change' },
      ];
      return {
        code: 0,
        stdout: prPages(args, [prs]),
      };
    }
    if (scenario === 'notes-pages') {
      const firstPage = Array.from({ length: 30 }, (_, index) => ({
        number: index + 1,
        title: 'Actual change',
      }));
      return {
        code: 0,
        stdout: prPages(args, [
          firstPage,
          [{ number: 31, title: 'Later page' }],
        ]),
      };
    }
    return fixturePrLookup(args);
  }
  return status === 200
    ? {
        code: 0,
        stdout: args.includes('--jq') ? '123' : JSON.stringify(release),
      }
    : { code: 1, stderr: `HTTP ${status}` };
});
register('node', async ({ args }) => {
  console.log(`FORMAT ${JSON.stringify(args)}`);
  return args.at(-1) === sha
    ? { code: 0, stdout: 'Formatted fixture' }
    : { code: 1, stderr: 'Formatter received an unresolved local ref' };
});
const script =
  scenario === 'create'
    ? 'create-github-release'
    : scenario === 'format'
      ? 'format-github-release'
      : 'format-release-notes';
const entry = entryPath
  ? pathToFileURL(resolve(originalDirectory, entryPath))
  : new URL(`../../js/scripts/${script}.mjs`, import.meta.url);
process.env.VERSION = scenario.startsWith('notes') ? 'v1.2.3' : '1.2.3';
process.env.REPOSITORY = 'fixture/repo';
process.env.TARGET_COMMITISH = 'HEAD';
process.env.COMMIT_SHA = 'HEAD';
process.env.RELEASE_ID = '123';
process.env.GH_TOKEN = '';
process.env.GITHUB_TOKEN = '';
process.argv = [process.execPath, fileURLToPath(entry)];
console.log(`EXPECTED_SHA ${sha}`);
await import(entry.href);
