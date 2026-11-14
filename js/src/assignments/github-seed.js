import { mkdtemp, rm, lstat, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { assignmentFailure, assignmentTarget } from './validation.js';

const gitIdentity = [
  '-c',
  'user.name=Meta Sovereign',
  '-c',
  'user.email=meta-sovereign@users.noreply.github.com',
  '-c',
  'commit.gpgsign=false',
];

const restoreMissingWorkflows = async (directory, execute) => {
  for (const part of ['.github', '.github/workflows']) {
    const destination = path.join(directory, part);
    const stat = await lstat(destination).catch((error) => {
      if (error.code !== 'ENOENT') {
        throw error;
      }
      return null;
    });
    if (stat && (!stat.isDirectory() || stat.isSymbolicLink())) {
      throw assignmentFailure(
        'seed-path',
        'A template destination is not a regular directory.'
      );
    }
    if (!stat) {
      await mkdir(destination);
    }
  }
  const listing = await execute(
    'git',
    ['ls-tree', '-r', '--name-only', 'FETCH_HEAD', '--', '.github/workflows'],
    directory
  );
  for (const name of listing.stdout.trim().split('\n').filter(Boolean)) {
    if (!/^\.github\/workflows\/[A-Za-z0-9_.-]+\.ya?ml$/u.test(name)) {
      continue;
    }
    const source = await execute(
      'git',
      ['show', `FETCH_HEAD:${name}`],
      directory
    );
    try {
      await writeFile(path.join(directory, name), source.stdout, {
        flag: 'wx',
      });
      await execute('git', ['add', '--', name], directory);
    } catch (error) {
      if (error.code !== 'EEXIST') {
        throw error;
      }
    }
  }
};

/** Merge without replacing existing files or force-pushing. Conflicts refuse. */
export const seedAssignmentHistory = async ({
  run,
  target,
  template,
  existing,
  signal,
}) => {
  assignmentTarget(target);
  assignmentTarget(template);
  const temporary = await mkdtemp(path.join(tmpdir(), 'meta-assignment-'));
  const directory = path.join(temporary, 'repository');
  const execute = (command, args, cwd) => run(command, args, { signal, cwd });
  try {
    await execute('gh', [
      'repo',
      'clone',
      `https://github.com/${existing ? target : template}`,
      directory,
      '--',
      '--single-branch',
      '--filter=blob:none',
    ]);
    if (existing) {
      await execute(
        'git',
        ['fetch', '--no-tags', '--', `https://github.com/${template}`, 'HEAD'],
        directory
      );
      await execute(
        'git',
        [
          ...gitIdentity,
          'merge',
          '--allow-unrelated-histories',
          '-Xours',
          '--no-edit',
          '--no-commit',
          'FETCH_HEAD',
        ],
        directory
      );
      await restoreMissingWorkflows(directory, execute);
      const { stdout } = await execute(
        'git',
        ['status', '--porcelain'],
        directory
      );
      if (stdout.trim()) {
        await execute(
          'git',
          [...gitIdentity, 'commit', '-m', 'Add assignment CI/CD template'],
          directory
        );
      }
    }
    signal?.throwIfAborted();
    await execute(
      'git',
      [
        '-c',
        'credential.helper=',
        '-c',
        'credential.helper=!gh auth git-credential',
        'push',
        '--',
        `https://github.com/${target}.git`,
        'HEAD',
      ],
      directory
    );
  } catch (error) {
    if (signal?.aborted) {
      throw error;
    }
    throw assignmentFailure(
      'seed-unverified',
      'Template history was not confirmed. Existing repository work was not force-pushed.'
    );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
};
