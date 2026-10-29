import { execFileSync } from 'node:child_process';
import { debug } from './debug-print.mjs';

// GitHub accepts branch names and SHAs, not a runner's symbolic HEAD. Resolve
// after versioning/pushing so the tag and PR lookup use the validated commit.
export function resolveReleaseCommit(ref = 'HEAD') {
  const sha = execFileSync(
    'git',
    ['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
  ).trim();
  if (!/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(sha)) {
    throw new Error('Git did not return a full release commit SHA');
  }
  debug('Resolved release commit', { sha });
  return sha;
}

// Compare complete headings, not a version interpolated into a regex (1.2.3
// also matched 1.2.30). Markdown subheadings remain part of the release body.
export function extractReleaseNotes(changelog, version) {
  const lines = changelog.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trimEnd() === `## ${version}`);
  if (start < 0) {
    throw new Error(`CHANGELOG.md has no entry for release ${version}`);
  }
  const remaining = lines.slice(start + 1);
  const end = remaining.findIndex((line) => line.startsWith('## '));
  return (
    remaining
      .slice(0, end < 0 ? undefined : end)
      .join('\n')
      .trim() || `Release ${version}`
  );
}

// GitHub caps release bodies. Keep a conservative UTF-8 byte budget, as in
// the reference templates, and link the complete immutable changelog.
export function limitReleaseNotes(body, repository, tag, maxBytes = 60000) {
  if (Buffer.byteLength(body, 'utf8') <= maxBytes) {
    return body;
  }
  const notice = `\n\nFull changelog: https://github.com/${repository}/blob/${encodeURIComponent(tag)}/CHANGELOG.md`;
  const budget = maxBytes - Buffer.byteLength(notice, 'utf8');
  if (budget < 0) {
    throw new Error('Release notes budget is too small for the changelog link');
  }
  let prefix = '';
  let bytes = 0;
  for (const character of body) {
    bytes += Buffer.byteLength(character, 'utf8');
    if (bytes > budget) {
      break;
    }
    prefix += character;
  }
  return prefix + notice;
}
