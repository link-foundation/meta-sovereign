#!/usr/bin/env bun

/**
 * Publish to npm using OIDC trusted publishing
 * Usage: node js/scripts/publish-to-npm.mjs [--should-pull] [--js-root <path>]
 *   should_pull: Optional flag to pull latest changes before publishing (for release job)
 *
 * Configuration:
 * - CLI: --js-root <path> to explicitly set JavaScript root
 * - Environment: JS_ROOT=<path>
 *
 * Uses link-foundation libraries:
 * - use-m: Dynamic package loading without package.json dependencies
 * - command-stream: Modern shell command execution with streaming support
 * - lino-arguments: Unified configuration from CLI args, env vars, and .lenv files
 *
 * Addresses issues documented in:
 * - Issue #21: Supporting both single and multi-language repository structures
 * - Reference: link-assistant/agent PR #112 (--legacy-peer-deps fix)
 * - Reference: link-assistant/agent PR #114 (configurable package root)
 */

import { appendFileSync } from 'fs';

import { getJsRoot, needsCd, parseJsRootConfig } from './js-paths.mjs';
import { formatNpmPackageVersion, readPackageInfo } from './package-info.mjs';

// Load use-m dynamically
const { use } = eval(
  await (await fetch('https://unpkg.com/use-m/use.js')).text()
);

// Import link-foundation libraries
const { $ } = await use('command-stream');
const { makeConfig } = await use('lino-arguments');

// Parse CLI arguments using lino-arguments
const config = makeConfig({
  yargs: ({ yargs, getenv }) =>
    yargs
      .option('should-pull', {
        type: 'boolean',
        default: getenv('SHOULD_PULL', false),
        describe: 'Pull latest changes before publishing',
      })
      .option('js-root', {
        type: 'string',
        default: getenv('JS_ROOT', ''),
        describe:
          'JavaScript package root directory (auto-detected if not specified)',
      }),
});

const { shouldPull, jsRoot: jsRootArg } = config;

// Get JavaScript package root (auto-detect or use explicit config)
const jsRootConfig = jsRootArg || parseJsRootConfig();
const jsRoot = getJsRoot({ jsRoot: jsRootConfig, verbose: true });
const { name: packageName, version: currentPackageVersion } = readPackageInfo({
  jsRoot,
});

const MAX_RETRIES = 3;
const RETRY_DELAY = 10000; // 10 seconds
// npm can take minutes before a new version is visible; it holds the upload
// as a staged version meanwhile, which a re-publish of it collides with.
const VISIBLE_TIMEOUT = 10 * 60 * 1000; // 10 minutes
const VISIBLE_POLL_INTERVAL = 15000; // 15 seconds
const STAGED_PATTERN = /cannot publish over previously staged version/i;

// Store the original working directory to restore after cd commands
// IMPORTANT: command-stream's cd is a virtual command that calls process.chdir()
const originalCwd = process.cwd();

// Patterns that indicate publish failure in changeset output
// Reference: link-assistant/agent PR #116 - prevent false positives in CI/CD
const FAILURE_PATTERNS = [
  'packages failed to publish',
  'error occurred while publishing',
  'npm error code E',
  'npm error 404',
  'npm error 401',
  'npm error 403',
  'Access token expired',
  'ENEEDAUTH',
];

/**
 * Sleep for specified milliseconds
 * @param {number} ms
 */
function sleep(ms) {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
}

/**
 * Check if the output contains any failure patterns
 * Reference: link-assistant/agent PR #116
 * @param {string} output - Combined stdout and stderr
 * @returns {string|null} - The matched failure pattern or null if no failure detected
 */
function detectPublishFailure(output) {
  const lowerOutput = output.toLowerCase();
  for (const pattern of FAILURE_PATTERNS) {
    if (lowerOutput.includes(pattern.toLowerCase())) {
      return pattern;
    }
  }
  return null;
}

/**
 * Verify that a package version is published on npm
 * Reference: link-assistant/agent PR #116
 * @param {string} packageName
 * @param {string} version
 * @returns {Promise<boolean>}
 */
async function verifyPublished(packageName, version) {
  const result = await $`npm view "${packageName}@${version}" version`.run({
    capture: true,
  });
  return result.code === 0 && result.stdout.trim().includes(version);
}

/**
 * Wait until a package version is visible on npm
 * @param {string} packageName
 * @param {string} version
 * @returns {Promise<boolean>}
 */
async function waitForPublished(packageName, version) {
  const deadline = Date.now() + VISIBLE_TIMEOUT;
  for (;;) {
    if (await verifyPublished(packageName, version)) {
      return true;
    }
    if (Date.now() > deadline) {
      return false;
    }
    console.log(
      `${packageName}@${version} is not visible on npm yet, checking again in ${VISIBLE_POLL_INTERVAL / 1000}s...`
    );
    await sleep(VISIBLE_POLL_INTERVAL);
  }
}

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
 * Run changeset:publish command with output capture
 * @returns {Promise<{result: object|null, error: Error|null}>}
 */
async function runChangesetPublish() {
  try {
    // Run changeset:publish from the js directory where package.json with this script exists
    // IMPORTANT: Use .run({ capture: true }) to capture output for failure detection
    // IMPORTANT: cd is a virtual command that calls process.chdir(), so we restore after
    if (needsCd({ jsRoot })) {
      const result = await $`cd ${jsRoot} && npm run changeset:publish`.run({
        capture: true,
      });
      process.chdir(originalCwd);
      return { result, error: null };
    }
    const result = await $`npm run changeset:publish`.run({ capture: true });
    return { result, error: null };
  } catch (error) {
    // Restore cwd on error before retry
    if (needsCd({ jsRoot })) {
      process.chdir(originalCwd);
    }
    return { result: null, error };
  }
}

/**
 * Analyze publish result for failures using multi-layer detection
 * Reference: link-assistant/agent PR #116
 * @param {object|null} publishResult - The result from runChangesetPublish
 * @param {Error|null} commandError - Error thrown by the command
 * @returns {Error|null} - Error if failure detected, null otherwise
 */
function analyzePublishResult(publishResult, commandError) {
  if (commandError) {
    return commandError;
  }

  const combinedOutput = publishResult
    ? `${publishResult.stdout || ''}\n${publishResult.stderr || ''}`
    : '';

  // Log the output for debugging
  if (combinedOutput.trim()) {
    console.log('Changeset output:', combinedOutput);
  }

  // Check for failure patterns in output (most reliable for changeset)
  const failurePattern = detectPublishFailure(combinedOutput);
  if (failurePattern) {
    console.error(`Detected publish failure: "${failurePattern}"`);
    return new Error(`Publish failed: detected "${failurePattern}" in output`);
  }

  // Check exit code (if available and non-zero)
  if (publishResult && publishResult.code !== 0) {
    console.error(`Changeset exited with code ${publishResult.code}`);
    return new Error(`Publish failed with exit code ${publishResult.code}`);
  }

  return null;
}

/**
 * Perform a single publish attempt with verification
 * @param {string} currentVersion
 * @returns {Promise<{success: boolean, error: Error|null}>}
 */
async function attemptPublish(currentVersion) {
  const { result, error } = await runChangesetPublish();
  const output = `${result?.stdout || ''}\n${result?.stderr || ''}`;

  if (STAGED_PATTERN.test(output)) {
    // An earlier attempt uploaded this version and npm is still processing it
    console.log(
      'npm already holds this version from an earlier attempt; waiting for it to go live...'
    );
  } else {
    const analysisError = analyzePublishResult(result, error);
    if (analysisError) {
      return { success: false, error: analysisError };
    }
  }

  // Verify the package is actually on npm (ultimate verification)
  console.log('Verifying package was published to npm...');
  const isPublished = await waitForPublished(packageName, currentVersion);

  if (isPublished) {
    return { success: true, error: null };
  }

  console.error('Verification failed: package not found on npm after publish');
  return {
    success: false,
    error: new Error('Package not found on npm after publish attempt'),
  };
}

async function main() {
  try {
    if (shouldPull) {
      // Pull the latest changes we just pushed
      await $`git pull origin main`;
    }

    const currentVersion = currentPackageVersion;
    console.log(`Current version to publish: ${currentVersion}`);

    // Check if this version is already published on npm
    console.log(
      `Checking if version ${currentVersion} is already published...`
    );
    const pkgSpec = formatNpmPackageVersion(packageName, currentVersion);
    const checkResult = await $`npm view "${pkgSpec}" version`.run({
      capture: true,
    });

    // command-stream returns { code: 0 } on success, { code: 1 } on failure (e.g., E404)
    // Exit code 0 means version exists, non-zero means version not found
    if (checkResult.code === 0) {
      console.log(`Version ${currentVersion} is already published to npm`);
      setOutput('published', 'true');
      setOutput('published_version', currentVersion);
      setOutput('already_published', 'true');
      return;
    }

    // Version not found on npm (E404), proceed with publish
    console.log(
      `Version ${currentVersion} not found on npm, proceeding with publish...`
    );

    // Publish to npm using OIDC trusted publishing with retry logic
    // Multi-layer failure detection based on link-assistant/agent PR #116
    for (let i = 1; i <= MAX_RETRIES; i++) {
      console.log(`Publish attempt ${i} of ${MAX_RETRIES}...`);
      const { success, error } = await attemptPublish(currentVersion);

      if (success) {
        setOutput('published', 'true');
        setOutput('published_version', currentVersion);
        console.log(`\u2705 Published ${pkgSpec} to npm`);
        return;
      }

      if (i < MAX_RETRIES) {
        console.log(
          `Publish failed: ${error.message}, waiting ${RETRY_DELAY / 1000}s before retry...`
        );
        await sleep(RETRY_DELAY);
      }
    }

    console.error(`\u274C Failed to publish after ${MAX_RETRIES} attempts`);
    process.exit(1);
  } catch (error) {
    // Restore cwd on error
    process.chdir(originalCwd);
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
