import { createHash } from 'node:crypto';
import {
  lstat,
  readFile,
  realpath,
  mkdir,
  writeFile,
  mkdtemp,
  rm,
} from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { runAssignmentCommand } from '../assignments/commands.js';
import { cvPublicationFailure } from './cv-publication-record.js';

export const publicationDigest = (text) =>
  createHash('sha256').update(text).digest('hex');
const refuse = () => {
  throw cvPublicationFailure();
};
const traceCommandFailure = (args, error) => {
  if (process.env.CI_CV_PUBLICATION_DEBUG !== '1') {
    return;
  }
  // Never log arguments, native stderr, a repository path or snapshot content.
  const operation = args[0] === '-c' ? args[2] : args[0];
  console.error(
    '[cv-publication-git]',
    JSON.stringify({
      operation,
      filenameTooLong: /filename too long/iu.test(error?.commandError ?? ''),
    })
  );
};
const allowedNetworkRemote = (parsed) =>
  ['https:', 'http:', 'ssh:', 'git:', 'file:'].includes(parsed.protocol) &&
  !parsed.password &&
  !parsed.search &&
  !parsed.hash &&
  (!parsed.username || parsed.protocol === 'ssh:');
const info = async (file) => {
  try {
    return await lstat(file);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
};
/** Never replace a private export, pending plan, symlink or different snapshot. */
const snapshotPaths = async (plan, create, signal) => {
  for (const file of plan.files) {
    signal?.throwIfAborted();
    let folder = plan.repository;
    for (const segment of plan.directory.split('/')) {
      folder = path.join(folder, segment);
      if (create) {
        await mkdir(folder).catch((error) => {
          if (error.code !== 'EEXIST') {
            throw error;
          }
        });
      }
      const stat = await info(folder);
      if (stat && (!stat.isDirectory() || stat.isSymbolicLink())) {
        refuse();
      }
    }
    const destination = path.join(plan.repository, file.path);
    const stat = await info(destination);
    if (stat) {
      if (
        !stat.isFile() ||
        stat.isSymbolicLink() ||
        stat.size !== file.bytes ||
        (await readFile(destination, 'utf8')) !== file.content
      ) {
        refuse();
      }
    } else if (create) {
      await writeFile(destination, file.content, { flag: 'wx', mode: 0o600 });
    }
  }
};

/** Commands use an owned environment; methods retain no active attempt. */
const createGitCommand =
  (run) =>
  async (repository, args, signal, extra = {}) => {
    try {
      const answer = await run(
        'git',
        ['-c', 'core.longpaths=true', '--literal-pathspecs', ...args],
        {
          cwd: repository,
          signal,
          ...extra,
          env: {
            GIT_DIR: undefined,
            GIT_COMMON_DIR: undefined,
            GIT_WORK_TREE: undefined,
            GIT_INDEX_FILE: undefined,
            GIT_OBJECT_DIRECTORY: undefined,
            GIT_ALTERNATE_OBJECT_DIRECTORIES: undefined,
            ...extra.env,
          },
        }
      );
      signal?.throwIfAborted();
      return answer.stdout;
    } catch (error) {
      signal?.throwIfAborted();
      traceCommandFailure(args, error);
      throw cvPublicationFailure();
    }
  };

class CvPublicationGit {
  constructor(run) {
    this.git = createGitCommand(run);
  }
  async remoteHead(repository, url, branch, signal) {
    const output = await this.git(
      repository,
      [
        'ls-remote',
        '--exit-code',
        '--heads',
        '--',
        url,
        `refs/heads/${branch}`,
      ],
      signal
    );
    const match = output
      .trim()
      .match(/^([a-f\d]{40}|[a-f\d]{64})\trefs\/heads\/(.+)$/u);
    if (!match || match[2] !== branch) {
      refuse();
    }
    return match[1];
  }
  async remoteUrl(repository, remote, signal) {
    let url = (
      await this.git(
        repository,
        ['remote', 'get-url', '--push', '--all', remote],
        signal
      )
    ).trim();
    if (
      !url ||
      /[\r\n]/u.test(url) ||
      url.includes('\0') ||
      url.startsWith('-')
    ) {
      refuse();
    }
    if (/^[a-z][a-z\d+.-]*:\/\//iu.test(url)) {
      const parsed = new URL(url);
      if (!allowedNetworkRemote(parsed)) {
        refuse();
      }
    } else if (path.isAbsolute(url) || !url.includes(':')) {
      url = await realpath(path.resolve(repository, url));
    } else if (
      !/^(?:[a-zA-Z\d._-]+@)?[a-zA-Z\d][a-zA-Z\d._-]*:[^\s]+$/u.test(url) ||
      url.includes('::')
    ) {
      refuse();
    }
    return url;
  }
  async baseline(input, signal) {
    const repository = await realpath(input.repository);
    const root = (
      await this.git(repository, ['rev-parse', '--show-toplevel'], signal)
    ).trim();
    if ((await realpath(root)) !== repository) {
      refuse();
    }
    const branch = (
      await this.git(
        repository,
        ['symbolic-ref', '--quiet', '--short', 'HEAD'],
        signal
      )
    ).trim();
    await this.git(
      repository,
      ['check-ref-format', '--branch', branch],
      signal
    );
    const base = (
      await this.git(
        repository,
        ['rev-parse', '--verify', 'HEAD^{commit}'],
        signal
      )
    ).trim();
    const url = await this.remoteUrl(repository, input.remote, signal);
    if ((await this.remoteHead(repository, url, branch, signal)) !== base) {
      refuse();
    }
    return {
      repository,
      branch,
      base,
      remoteFingerprint: publicationDigest(url),
      destination: url,
      url,
    };
  }
  async verifyCommit(plan, commit, signal) {
    const parents = (
      await this.git(
        plan.repository,
        ['rev-list', '--parents', '-n', '1', commit],
        signal
      )
    ).trim();
    if (parents !== `${commit} ${plan.base}`) {
      refuse();
    }
    const paths = (
      await this.git(
        plan.repository,
        [
          'diff-tree',
          '--no-commit-id',
          '--name-only',
          '-r',
          '-z',
          plan.base,
          commit,
        ],
        signal
      )
    )
      .split('\0')
      .filter(Boolean);
    if (
      !paths.length ||
      paths.some((file) => !plan.files.some((row) => row.path === file))
    ) {
      refuse();
    }
    for (const file of plan.files) {
      const content = await this.git(
        plan.repository,
        ['show', `${commit}:${file.path}`],
        signal
      );
      if (
        content !== file.content ||
        publicationDigest(content) !== file.sha256
      ) {
        refuse();
      }
    }
  }
  async preview(input, files, signal) {
    const { url: _url, ...base } = await this.baseline(input, signal);
    await snapshotPaths({ ...input, ...base, files }, false, signal);
    return base;
  }
  async publish(plan, { signal, committed }) {
    const base = await this.baseline(plan, signal);
    if (
      ['repository', 'branch', 'base', 'remoteFingerprint'].some(
        (key) => base[key] !== plan[key]
      )
    ) {
      refuse();
    }
    const paths = plan.files.map((file) => file.path);
    if (
      (
        await this.git(
          plan.repository,
          ['diff', '--cached', '--name-only', '--', ...paths],
          signal
        )
      ).trim()
    ) {
      refuse();
    }
    await snapshotPaths(plan, true, signal);
    const commit = await this.snapshotCommit(plan, signal, committed);
    if (!commit) {
      return { state: 'unchanged', commit: null };
    }
    signal?.throwIfAborted();
    if (
      (await this.remoteUrl(plan.repository, plan.remote, signal)) !==
        base.url ||
      (await this.remoteHead(
        plan.repository,
        base.url,
        plan.branch,
        signal
      )) !== plan.base
    ) {
      refuse();
    }
    await this.git(
      plan.repository,
      [
        '-c',
        'push.pushOption=',
        'push',
        '--porcelain',
        '--no-follow-tags',
        '--no-verify',
        '--no-mirror',
        '--recurse-submodules=no',
        '--',
        base.url,
        `${commit}:refs/heads/${plan.branch}`,
      ],
      signal
    );
    if (
      (await this.remoteHead(
        plan.repository,
        base.url,
        plan.branch,
        signal
      )) !== commit
    ) {
      refuse();
    }
    return { state: 'published', commit };
  }
  async snapshotCommit(plan, signal, committed) {
    const temporary = await mkdtemp(
      path.join(tmpdir(), 'ms-cv-publish-index-')
    );
    let commit;
    try {
      const isolated = {
        env: { GIT_INDEX_FILE: path.join(temporary, 'index') },
      };
      await this.git(
        plan.repository,
        ['read-tree', plan.base],
        signal,
        isolated
      );
      for (const file of plan.files) {
        const blob = (
          await this.git(
            plan.repository,
            ['hash-object', '-w', '--stdin', '--no-filters'],
            signal,
            { input: file.content }
          )
        ).trim();
        await this.git(
          plan.repository,
          [
            'update-index',
            '--add',
            '--cacheinfo',
            `100644,${blob},${file.path}`,
          ],
          signal,
          isolated
        );
      }
      const tree = (
        await this.git(plan.repository, ['write-tree'], signal, isolated)
      ).trim();
      const previousTree = (
        await this.git(
          plan.repository,
          ['rev-parse', `${plan.base}^{tree}`],
          signal
        )
      ).trim();
      if (tree === previousTree) {
        return null;
      }
      commit = (
        await this.git(
          plan.repository,
          [
            '-c',
            `core.hooksPath=${temporary}`,
            'commit-tree',
            tree,
            '-p',
            plan.base,
            '-m',
            'Publish sanitized saved CV snapshots',
          ],
          signal
        )
      ).trim();
      await this.verifyCommit(plan, commit, signal);
      await committed(commit);
      const branch = (
        await this.git(
          plan.repository,
          ['symbolic-ref', '--quiet', '--short', 'HEAD'],
          signal
        )
      ).trim();
      if (branch !== plan.branch) {
        refuse();
      }
      await this.git(
        plan.repository,
        [
          '-c',
          `core.hooksPath=${temporary}`,
          'update-ref',
          `refs/heads/${plan.branch}`,
          commit,
          plan.base,
        ],
        signal
      );
      // Only the newly committed snapshot entries join the real index.
      for (const file of plan.files) {
        const blob = (
          await this.git(
            plan.repository,
            ['rev-parse', `${commit}:${file.path}`],
            signal
          )
        ).trim();
        await this.git(
          plan.repository,
          [
            'update-index',
            '--add',
            '--cacheinfo',
            `100644,${blob},${file.path}`,
          ],
          signal
        );
      }
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
    return commit;
  }
}

/** An owned alternate index excludes staged/private content and clean filters. */
export const createCvPublicationGit = ({ run = runAssignmentCommand } = {}) =>
  new CvPublicationGit(run);
