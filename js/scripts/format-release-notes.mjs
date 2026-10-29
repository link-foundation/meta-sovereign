#!/usr/bin/env node

/**
 * Script to format GitHub release notes with proper formatting:
 * - Preserve original Markdown and decoded JSON content
 * - Add link to PR that contains the release commit (if found)
 * - Add shields.io NPM version badge
 * - Format nicely with proper markdown
 *
 * PR Detection Logic:
 * 1. Extract commit hash from changelog entry (if present)
 * 2. Fall back to --commit-sha argument (passed from workflow)
 * 3. Look up PRs that contain the commit via GitHub API
 * 4. If no PR found, simply don't display any PR link (no guessing)
 *
 * Uses link-foundation libraries:
 * - Lockfile-installed release dependencies (npm ci)
 * - command-stream: Modern shell command execution with streaming support
 * - lino-arguments: Unified configuration from CLI args, env vars, and .lenv files
 *
 * Note: Uses --release-version instead of --version to avoid conflict with yargs' built-in --version flag.
 */

import {
  limitReleaseNotes,
  resolveReleaseCommit,
} from './github-release-content.mjs';
import { getJsRoot, parseJsRootConfig } from './js-paths.mjs';
import { readPackageInfo } from './package-info.mjs';
import {
  buildNpmVersionBadge,
  hasNpmVersionBadge,
  normalizeReleaseVersionForBadge,
} from './format-release-notes-helpers.mjs';

import { loadCommandStream, loadLinoArguments } from './use-module.mjs';

// Import link-foundation libraries
const { $ } = await loadCommandStream();
const { makeConfig } = await loadLinoArguments();

// Parse CLI arguments using lino-arguments
// Note: Using --release-version instead of --version to avoid conflict with yargs' built-in --version flag
const config = makeConfig({
  yargs: ({ yargs, getenv }) =>
    yargs
      .option('release-version', {
        type: 'string',
        default: getenv('VERSION', ''),
        describe: 'Version number (e.g., v0.8.36)',
      })
      .option('release-id', {
        type: 'string',
        default: getenv('RELEASE_ID', ''),
        describe: 'GitHub release ID',
      })
      .option('repository', {
        type: 'string',
        default: getenv('REPOSITORY', ''),
        describe: 'GitHub repository (e.g., owner/repo)',
      })
      .option('commit-sha', {
        type: 'string',
        default: getenv('COMMIT_SHA', ''),
        describe: 'Commit SHA for PR detection',
      })
      .option('js-root', {
        type: 'string',
        default: getenv('JS_ROOT', ''),
        describe:
          'JavaScript package root directory (auto-detected if not specified)',
      }),
});

const releaseId = config.releaseId;
const version = config.releaseVersion;
const repository = config.repository;
const passedCommitSha = config.commitSha;
const jsRootConfig = config.jsRoot || parseJsRootConfig();
const jsRoot = getJsRoot({ jsRoot: jsRootConfig, verbose: true });
const { name: packageName } = readPackageInfo({ jsRoot });

if (!releaseId || !version || !repository) {
  console.error(
    'Usage: format-release-notes.mjs --release-id <releaseId> --release-version <version> --repository <repository> [--commit-sha <sha>]'
  );
  process.exit(1);
}

try {
  // Get current release body
  const result = await $`gh api repos/${repository}/releases/${releaseId}`.run({
    capture: true,
  });
  const releaseData = JSON.parse(result.stdout);

  const currentBody = releaseData.body || '';

  // Skip only this package/version's generated badge.
  if (hasNpmVersionBadge(currentBody, packageName, version)) {
    console.log('ℹ️ Release notes already formatted');
    process.exit(0);
  }

  // The API already returns decoded JSON. Preserve Markdown, quotes, code
  // escapes and every changeset section; formatting only adds metadata.
  const commitHashes = [
    ...new Set(
      [...currentBody.matchAll(/^\s*- ([a-f0-9]{7,64}): /gm)].map(
        (match) => match[1]
      )
    ),
  ];
  if (commitHashes.length === 0 && passedCommitSha) {
    commitHashes.push(resolveReleaseCommit(passedCommitSha));
  }
  const prNumbers = new Set();
  for (const commit of commitHashes) {
    console.log(`ℹ️ Looking up PRs for commit ${commit}`);
    const prResult =
      await $`gh api repos/${repository}/commits/${commit}/pulls --paginate --slurp`.run(
        {
          capture: true,
        }
      );
    const pages = JSON.parse(prResult.stdout);
    if (!Array.isArray(pages) || pages.some((page) => !Array.isArray(page))) {
      throw new Error(`Invalid PR pages for commit ${commit}`);
    }
    const prs = pages.flat();
    if (
      prs.some(
        (pr) =>
          !Number.isInteger(pr.number) ||
          pr.number <= 0 ||
          typeof pr.title !== 'string'
      )
    ) {
      throw new Error(`Invalid PR evidence for commit ${commit}`);
    }
    for (const pr of prs) {
      if (!pr.title.includes('version packages')) {
        prNumbers.add(pr.number);
      }
    }
  }
  if (prNumbers.size === 0) {
    console.log('ℹ️ No related PR found - not adding a PR link');
  }

  // Build formatted release notes
  const versionWithoutV = normalizeReleaseVersionForBadge(version);
  const npmBadge = buildNpmVersionBadge(packageName, version);

  const related = prNumbers.size
    ? `\n\n**Related Pull Requests:** ${[...prNumbers].map((number) => `#${number}`).join(', ')}`
    : '';
  const metadata = `${related}\n\n---\n\n${npmBadge}`;
  // Reserve space for metadata so a large body retains its idempotency marker.
  const formattedBody =
    limitReleaseNotes(
      currentBody,
      repository,
      version,
      60000 - Buffer.byteLength(metadata, 'utf8')
    ) + metadata;

  // JSON input preserves literal special characters.
  const updatePayload = JSON.stringify({ body: formattedBody });
  await $`gh api repos/${repository}/releases/${releaseId} -X PATCH --input -`.run(
    { stdin: updatePayload }
  );

  console.log(`✅ Formatted release notes for ${versionWithoutV}`);
  if (prNumbers.size) {
    console.log(`   - Added links to PRs ${[...prNumbers].join(', ')}`);
  }
  console.log('   - Added shields.io npm badge');
  console.log('   - Preserved original release content');
} catch (error) {
  console.error('❌ Error formatting release notes:', error.message);
  process.exit(1);
}
