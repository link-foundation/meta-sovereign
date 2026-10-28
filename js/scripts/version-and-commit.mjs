#!/usr/bin/env bun

/**
 * Version packages and commit to main
 * Usage: node js/scripts/version-and-commit.mjs --mode <changeset|instant> [--bump-type <type>] [--description <desc>] [--js-root <path>]
 *   changeset: Run changeset version
 *   instant: Run instant version bump with bump_type (patch|minor|major) and optional description
 *
 * Configuration:
 * - CLI: --js-root <path> to explicitly set JavaScript root
 * - Environment: JS_ROOT=<path>
 *
 * Uses link-foundation libraries:
 * - Lockfile-installed release dependencies (npm ci)
 * - command-stream: Modern shell command execution with streaming support
 * - lino-arguments: Unified configuration from CLI args, env vars, and .lenv files
 *
 * Addresses issues documented in:
 * - Issue #21: Supporting both single and multi-language repository structures
 * - Reference: link-assistant/agent PR #112 (--legacy-peer-deps fix)
 * - Reference: link-assistant/agent PR #114 (configurable package root)
 */

import { readFileSync, appendFileSync, readdirSync } from 'fs';
import { assertValidatedReleaseTree } from './validated-release-tree.mjs';

import {
  getJsRoot,
  getPackageJsonPath,
  getChangesetDir,
  needsCd,
  parseJsRootConfig,
} from './js-paths.mjs';

import { loadCommandStream, loadLinoArguments } from './use-module.mjs';

// Import link-foundation libraries
const { $ } = await loadCommandStream();
const { makeConfig } = await loadLinoArguments();

// Parse CLI arguments using lino-arguments
const config = makeConfig({
  yargs: ({ yargs, getenv }) =>
    yargs
      .option('mode', {
        type: 'string',
        default: getenv('MODE', 'changeset'),
        describe: 'Version mode: changeset or instant',
        choices: ['changeset', 'instant'],
      })
      .option('bump-type', {
        type: 'string',
        default: getenv('BUMP_TYPE', ''),
        describe: 'Version bump type for instant mode: major, minor, or patch',
      })
      .option('description', {
        type: 'string',
        default: getenv('DESCRIPTION', ''),
        describe: 'Description for instant version bump',
      })
      .option('js-root', {
        type: 'string',
        default: getenv('JS_ROOT', ''),
        describe:
          'JavaScript package root directory (auto-detected if not specified)',
      }),
});

const { mode, bumpType, description, jsRoot: jsRootArg } = config;

// Get JavaScript package root (auto-detect or use explicit config)
const jsRootConfig = jsRootArg || parseJsRootConfig();
const jsRoot = getJsRoot({ jsRoot: jsRootConfig, verbose: true });

// Debug: Log parsed configuration
console.log('Parsed configuration:', {
  mode,
  bumpType,
  description: description || '(none)',
  jsRoot,
});

// Detect if positional arguments were used (common mistake)
const args = process.argv.slice(2);
if (args.length > 0 && !args[0].startsWith('--')) {
  console.error('Error: Positional arguments detected!');
  console.error('Command line arguments:', args);
  console.error('');
  console.error(
    'This script requires named arguments (--mode, --bump-type, --description, --js-root).'
  );
  console.error('Usage:');
  console.error('  Changeset mode:');
  console.error(
    '    node js/scripts/version-and-commit.mjs --mode changeset [--js-root <path>]'
  );
  console.error('  Instant mode:');
  console.error(
    '    node js/scripts/version-and-commit.mjs --mode instant --bump-type <major|minor|patch> [--description <desc>] [--js-root <path>]'
  );
  console.error('');
  console.error('Examples:');
  console.error(
    '  node js/scripts/version-and-commit.mjs --mode instant --bump-type patch --description "Fix bug"'
  );
  console.error('  node js/scripts/version-and-commit.mjs --mode changeset');
  console.error(
    '  node js/scripts/version-and-commit.mjs --mode changeset --js-root js'
  );
  process.exit(1);
}

// Validation: Ensure mode is set correctly
if (mode !== 'changeset' && mode !== 'instant') {
  console.error(`Invalid mode: "${mode}". Expected "changeset" or "instant".`);
  console.error('Command line arguments:', process.argv.slice(2));
  process.exit(1);
}

// Validation: Ensure bump type is provided for instant mode
if (mode === 'instant' && !bumpType) {
  console.error('Error: --bump-type is required for instant mode');
  console.error(
    'Usage: node js/scripts/version-and-commit.mjs --mode instant --bump-type <major|minor|patch> [--description <desc>] [--js-root <path>]'
  );
  process.exit(1);
}

// Store the original working directory to restore after cd commands
// IMPORTANT: command-stream's cd is a virtual command that calls process.chdir()
const originalCwd = process.cwd();

/**
 * Append to GitHub Actions output file
 * @param {string} key
 * @param {string} value
 */
function setOutput(key, value) {
  const outputFile = process.env.GITHUB_OUTPUT;
  if (outputFile) {
    appendFileSync(outputFile, `${key}=${value}\n`);
  }
}

/**
 * Count changeset files (excluding README.md)
 */
function countChangesets() {
  try {
    const changesetDir = getChangesetDir({ jsRoot });
    const files = readdirSync(changesetDir);
    return files.filter((f) => f.endsWith('.md') && f !== 'README.md').length;
  } catch {
    return 0;
  }
}

/**
 * Get package version
 * @param {string} source - 'local' or 'remote'
 */
async function getVersion(source = 'local') {
  const packageJsonPath = getPackageJsonPath({ jsRoot });
  if (source === 'remote') {
    const result = await $`git show origin/main:${packageJsonPath}`.run({
      capture: true,
    });
    return JSON.parse(result.stdout).version;
  }
  return JSON.parse(readFileSync(packageJsonPath, 'utf8')).version;
}

async function main() {
  try {
    // Configure git
    await $`git config user.name "github-actions[bot]"`;
    await $`git config user.email "github-actions[bot]@users.noreply.github.com"`;

    // Check if remote main has advanced (handles re-runs after partial success)
    console.log('Checking for remote changes...');
    await $`git fetch origin main`;

    const localHeadResult = await $`git rev-parse HEAD`.run({ capture: true });
    const localHead = localHeadResult.stdout.trim();

    const remoteHeadResult = await $`git rev-parse origin/main`.run({
      capture: true,
    });
    const remoteHead = remoteHeadResult.stdout.trim();

    if (localHead !== remoteHead) {
      try {
        assertValidatedReleaseTree(localHead, remoteHead);
      } catch (error) {
        console.log(
          `::notice::Release superseded by newer source on main: ${error.message}`
        );
        setOutput('version_committed', 'false');
        return;
      }
      // Re-runs may resume a version-only commit, but must use its actual tree.
      await $`git checkout -B main origin/main`;
      const localVersion = JSON.parse(
        readFileSync(getPackageJsonPath({ jsRoot }), 'utf8')
      ).version;
      if (countChangesets() === 0) {
        setOutput('version_committed', 'false');
        setOutput('already_released', 'true');
        setOutput('new_version', localVersion);
        return;
      }
    }

    // Get current version before bump
    const oldVersion = await getVersion();
    console.log(`Current version: ${oldVersion}`);

    if (mode === 'instant') {
      console.log('Running instant version bump...');
      // Run instant version bump script
      // Pass --js-root to ensure consistent path handling
      // Rely on command-stream's auto-quoting for proper argument handling
      if (description) {
        await $`node js/scripts/instant-version-bump.mjs --bump-type ${bumpType} --description ${description} --js-root ${jsRoot}`;
      } else {
        await $`node js/scripts/instant-version-bump.mjs --bump-type ${bumpType} --js-root ${jsRoot}`;
      }
    } else {
      console.log('Running changeset version...');
      // Run changeset version to bump versions and update CHANGELOG
      // IMPORTANT: cd is a virtual command that calls process.chdir(), so we restore after
      if (needsCd({ jsRoot })) {
        await $`cd ${jsRoot} && npm run changeset:version`;
        process.chdir(originalCwd);
      } else {
        await $`npm run changeset:version`;
      }
    }

    // Get new version after bump
    const newVersion = await getVersion();
    console.log(`New version: ${newVersion}`);
    setOutput('new_version', newVersion);

    // Check if there are changes to commit
    const statusResult = await $`git status --porcelain`.run({ capture: true });
    const status = statusResult.stdout.trim();

    if (status) {
      console.log('Changes detected, committing...');

      // Stage all changes (package.json, package-lock.json, CHANGELOG.md, deleted changesets)
      await $`git add -- package.json package-lock.json CHANGELOG.md .changeset`;
      // Reject accidental dependency/config edits before creating a release commit.
      const staged = await $`git diff --cached --name-only`.run({
        capture: true,
      });
      console.log(`Staged release metadata: ${staged.stdout}`);

      // Commit with version number as message
      const commitMessage = newVersion;
      const escapedMessage = commitMessage.replace(/"/g, '\\"');
      await $`git commit -m "${escapedMessage}"`;
      assertValidatedReleaseTree(localHead, 'HEAD');

      // Push directly to main
      try {
        await $`git push origin HEAD:refs/heads/main`;
      } catch (error) {
        throw new Error(
          'Release push refused. Check branch rules/token write access; a concurrent main update must be validated by its own run. No policy refusal is retried.',
          { cause: error }
        );
      }

      console.log('\u2705 Version bump committed and pushed to main');
      setOutput('version_committed', 'true');
    } else {
      console.log('No changes to commit');
      setOutput('version_committed', 'false');
    }
  } catch (error) {
    // Restore cwd on error
    process.chdir(originalCwd);
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
