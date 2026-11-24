#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { formatIndented } from 'lino-objects-codec';
import {
  runnerSourceAsset,
  runnerSourcePin,
} from '../src/transport/runner-deployment-receipt.js';

const execute = promisify(execFile);
const name = runnerSourceAsset;
const recipeName = `${name}.lino`;
const paths = ['js/bin', 'js/src', 'package.json', 'package-lock.json'];

const fileDigest = async (file) => {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) {
    hash.update(chunk);
  }
  return hash.digest('hex');
};

/** Build only tracked product files from the reviewed release commit. */
export const buildRunnerSource = async ({ ref, output, cwd, tag }) => {
  const git = async (...args) => (await execute('git', args, { cwd })).stdout;
  const commit = (
    await git('rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`)
  ).trim();
  const { version } = JSON.parse(await git('show', `${commit}:package.json`));
  const release = `v${version}`;
  if (
    (tag !== undefined && release !== tag) ||
    !runnerSourcePin(`${release}@${'0'.repeat(64)}`)
  ) {
    throw new Error('The runner source release must have a supported version.');
  }
  const lock = await git('show', `${commit}:package-lock.json`);
  const applicationLock = createHash('sha256').update(lock).digest('hex');
  const artifacts = (
    await git('ls-tree', '-r', '--name-only', commit, '--', 'vendor/picomatch')
  )
    .trim()
    .split('\n')
    .filter((file) =>
      /^vendor\/picomatch\/picomatch-[A-Za-z0-9.-]+\.tgz$/u.test(file)
    );
  if (!artifacts.length) {
    throw new Error('The runner source is missing its vendored package.');
  }
  await mkdir(output, { recursive: true });
  const stage = await mkdtemp(join(output, '.runner-source-'));
  try {
    const archive = resolve(stage, name);
    await git(
      'archive',
      '--format=tar.gz',
      `--output=${archive}`,
      commit,
      '--',
      ...paths,
      ...artifacts
    );
    if ((await stat(archive)).size > 24 * 1024 * 1024) {
      throw new Error(
        'The runner source archive exceeds its deployment bound.'
      );
    }
    const sha256 = await fileDigest(archive);
    const recipe = {
      release,
      commit,
      applicationSource: `${release}@${sha256}`,
      applicationLock,
    };
    const file = join(stage, recipeName);
    await writeFile(file, formatIndented({ id: 'application', obj: recipe }));
    await rename(archive, join(output, name));
    await rename(file, join(output, recipeName));
    return recipe;
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
};

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const [, , ref, output, tag] = process.argv;
  if (!ref || !output) {
    throw new Error(
      'Use build-runner-source.mjs <release-commit> <output-directory>.'
    );
  }
  const recipe = await buildRunnerSource({ ref, output, tag });
  console.log(
    `Prepared runner source for ${recipe.release} at ${recipe.commit}.`
  );
}
