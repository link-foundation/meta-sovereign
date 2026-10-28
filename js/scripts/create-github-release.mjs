#!/usr/bin/env bun

/**
 * Create GitHub Release from CHANGELOG.md
 * Usage: node js/scripts/create-github-release.mjs --release-version <version> --repository <repository> [--tag-prefix <prefix>]
 *   release-version: Version number (e.g., 1.0.0)
 *   repository: GitHub repository (e.g., owner/repo)
 *   tag-prefix: Prefix for the git tag (default: "v", use "js-v" for multi-language repos)
 *
 * Uses link-foundation libraries:
 * - Lockfile-installed release dependencies (npm ci)
 * - command-stream: Modern shell command execution with streaming support
 * - lino-arguments: Unified configuration from CLI args, env vars, and .lenv files
 */

import { readFileSync } from 'fs';
import { probeGitHubRelease } from './github-release-state.mjs';

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
        describe: 'Version number (e.g., 1.0.0)',
      })
      .option('repository', {
        type: 'string',
        default: getenv('REPOSITORY', ''),
        describe: 'GitHub repository (e.g., owner/repo)',
      })
      .option('target', {
        type: 'string',
        default: getenv('TARGET_COMMITISH', ''),
        describe:
          'Commit the tag points at when it does not exist yet (default: the default branch)',
      })
      .option('tag-prefix', {
        type: 'string',
        default: getenv('TAG_PREFIX', 'v'),
        describe:
          'Prefix for the git tag (e.g., "js-v" for multi-language repos)',
      }),
});

const { releaseVersion: version, repository, tagPrefix, target } = config;

if (!version || !repository) {
  console.error('Error: Missing required arguments');
  console.error(
    'Usage: node js/scripts/create-github-release.mjs --release-version <version> --repository <repository> [--tag-prefix <prefix>]'
  );
  process.exit(1);
}

const tag = `${tagPrefix}${version}`;

console.log(`Creating GitHub release for ${tag}...`);

// Idempotent: the desktop release workflow (issue #37) creates the
// release when npm publishing is unavailable, and the npm release path
// must not fail when it later publishes the same version.
const existing = await probeGitHubRelease(repository, tag);
if (existing) {
  console.log(`\u2705 GitHub release ${tag} already exists, skipping`);
  process.exit(0);
}

try {
  // Read CHANGELOG.md
  const changelog = readFileSync('./CHANGELOG.md', 'utf8');

  // Extract changelog entry for this version
  // Read from CHANGELOG.md between this version header and the next version header
  const versionHeaderRegex = new RegExp(`## ${version}[\\s\\S]*?(?=## \\d|$)`);
  const match = changelog.match(versionHeaderRegex);

  let releaseNotes = '';
  if (match) {
    // Remove the version header itself and trim
    releaseNotes = match[0].replace(`## ${version}`, '').trim();
  }

  if (!releaseNotes) {
    releaseNotes = `Release ${version}`;
  }

  // Create release using GitHub API with JSON input
  // This avoids shell escaping issues that occur when passing text via command-line arguments
  // (Previously caused apostrophes like "didn't" to appear as "didn'''" in releases)
  const payload = JSON.stringify({
    tag_name: tag,
    name: tag,
    body: releaseNotes,
    ...(target ? { target_commitish: target } : {}),
  });

  await $`gh api repos/${repository}/releases -X POST --input -`.run({
    stdin: payload,
  });

  console.log(`\u2705 Created GitHub release: ${tag}`);
} catch (error) {
  console.error('Error creating release:', error.message);
  process.exit(1);
}
