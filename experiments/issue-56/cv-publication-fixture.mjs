import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createMemoryStore } from '../../js/src/storage/universal.js';
import { createVacancyService } from '../../js/src/jobs/service.js';
import { createCvPublicationGit } from '../../js/src/jobs/cv-publication-git.js';
import { runAssignmentCommand } from '../../js/src/assignments/commands.js';
import { cvWatchRaw } from './cv-watch-fixture.mjs';
import { traceCvPublicationFixture as trace } from './cv-publication-trace.mjs';

/** Two tiny owned repositories: no account, network transport or real CV data. */
export const cvPublicationFixture = async ({
  intercept,
  now = Date.now,
} = {}) => {
  const folder = await mkdtemp(path.join(tmpdir(), 'ms-cv-publication-'));
  const repository = path.join(folder, 'repository');
  const remote = path.join(folder, 'remote.git');
  const calls = [];
  const command = (args, cwd = repository, options = {}) =>
    trace('setup-git', () =>
      runAssignmentCommand('git', args, { cwd, ...options })
    );
  const store = createMemoryStore();
  let service;
  try {
    await mkdir(repository);
    await command(['init', '--bare', '--initial-branch=main', remote], folder);
    await command(['init', '--initial-branch=main']);
    await command(['config', 'user.name', 'Publication fixture']);
    await command(['config', 'user.email', 'fixture@example.test']);
    await writeFile(
      path.join(repository, 'README.md'),
      'Existing public file\n'
    );
    await writeFile(
      path.join(repository, 'pending-plan.lino'),
      'PRIVATE_PENDING_PLAN\n'
    );
    await writeFile(
      path.join(repository, '.gitattributes'),
      '*.lino filter=unsafe\n'
    );
    await command([
      'add',
      '--',
      'README.md',
      'pending-plan.lino',
      '.gitattributes',
    ]);
    await command(['commit', '-m', 'Initial fixture']);
    await command(['remote', 'add', 'origin', remote]);
    await command(['push', '-u', 'origin', 'main']);
    await command([
      'config',
      'filter.unsafe.clean',
      'echo PRIVATE_FILTER_REPLACEMENT',
    ]);
    await writeFile(
      path.join(repository, 'private-export.pdf'),
      'PRIVATE_PDF\n'
    );
    await writeFile(
      path.join(repository, 'private-backup.json'),
      'PRIVATE_BACKUP\n'
    );
    await writeFile(
      path.join(repository, 'private-staged.txt'),
      'PRIVATE_STAGED\n'
    );
    await command(['add', '--', 'private-staged.txt']);
    await store.put({
      id: 'jobs-cv-snapshots:jobs',
      version: 1,
      browserSlot: 'jobs',
      snapshots: [
        {
          hash: 'saved123',
          cv: {
            ...cvWatchRaw(),
            about: 'Public engineering work\nprivate@example.test',
          },
          sha256: 'a'.repeat(64),
          savedAt: '2026-11-14T20:00:00.000Z',
          attemptId: 'verified-save',
          evidence: 'verified-owner-save-native-export',
        },
      ],
    });
    const git = createCvPublicationGit({
      run: async (name, args, options) => {
        calls.push(args);
        const proceed = () =>
          trace('publication-git', () =>
            runAssignmentCommand(name, args, options)
          );
        return intercept
          ? intercept({ name, args, options, proceed })
          : proceed();
      },
    });
    const options = {
      store,
      artifactRoot: path.join(folder, 'native-exports'),
      availability: async () => ({ available: false }),
      cvPublication: { git, now },
    };
    service = createVacancyService(options);
    return {
      folder,
      repository,
      remote,
      store,
      service,
      options,
      artifactRoot: options.artifactRoot,
      calls,
      command,
      input: {
        requestId: 'publication-plan',
        browserSlot: 'jobs',
        repository,
        resumes: ['saved123'],
      },
      async close() {
        await trace('service-stop', () => service.stop());
        await trace('fixture-remove', () =>
          rm(folder, { recursive: true, force: true })
        );
      },
    };
  } catch (error) {
    await service?.stop();
    await rm(folder, { recursive: true, force: true });
    throw error;
  }
};

export const withCvPublicationFixture = async (work, options) => {
  const fixture = await cvPublicationFixture(options);
  try {
    await work(fixture);
  } finally {
    await fixture.close();
  }
};
