import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, symlink } from 'node:fs/promises';
import path from 'node:path';
import { withCvPublicationFixture } from '../../experiments/issue-56/cv-publication-fixture.mjs';

test(
  'invalid publication selections and paths refuse before inspecting a Git target',
  { timeout: 20000 },
  async () =>
    withCvPublicationFixture(async (f) => {
      for (const invalid of [
        { directory: '../private' },
        { directory: '.git' },
        { directory: 'examples//snapshots' },
        { remote: '--force' },
        { remote: true },
        { repository: '' },
        { resumes: [] },
        { resumes: ['saved123', 'saved123'] },
        { resumes: ['pending-plan'] },
        { requestId: '../reused' },
      ]) {
        await assert.rejects(
          f.service['cv-publish-plan']({ ...f.input, ...invalid })
        );
      }
      assert.equal(f.calls.length, 0);
    })
);

test(
  'a symlinked snapshot folder and credential-bearing remote are never used',
  { timeout: 20000 },
  async () =>
    withCvPublicationFixture(async (f) => {
      const outside = path.join(f.folder, 'private');
      await mkdir(outside);
      await symlink(outside, path.join(f.repository, 'examples'), 'junction');
      await assert.rejects(f.service['cv-publish-plan'](f.input));
      await f.command([
        'remote',
        'set-url',
        '--push',
        'origin',
        'https://fixture-user:PRIVATE_TOKEN@invalid.example/repository.git',
      ]);
      const before = f.calls.length;
      await assert.rejects(
        f.service['cv-publish-plan']({ ...f.input, requestId: 'credentials' }),
        (error) => {
          assert.equal(String(error).includes('PRIVATE_TOKEN'), false);
          return true;
        }
      );
      assert.equal(
        f.calls.slice(before).some((args) => args.includes('ls-remote')),
        false
      );
    })
);

test(
  'publication ignores an ambient index and never pushes configured follow-tags',
  { timeout: 20000 },
  async () =>
    withCvPublicationFixture(async (f) => {
      await f.command([
        'tag',
        '-a',
        'private-unpublished-tag',
        '-m',
        'PRIVATE_TAG_MESSAGE',
      ]);
      await f.command(['config', 'push.followTags', 'true']);
      const { publication } = await f.service['cv-publish-plan'](f.input);
      const index = (await f.command(['diff', '--cached', '--binary'])).stdout;
      const previous = process.env.GIT_INDEX_FILE;
      let answer;
      try {
        process.env.GIT_INDEX_FILE = path.join(f.folder, 'unrelated-index');
        answer = await f.service['cv-publish']({
          requestId: publication.requestId,
          confirmation: publication.confirmation,
          publish: true,
        });
      } finally {
        if (previous === undefined) {
          delete process.env.GIT_INDEX_FILE;
        } else {
          process.env.GIT_INDEX_FILE = previous;
        }
      }
      assert.equal(answer.publication.state, 'published');
      assert.equal(
        (await f.command(['diff', '--cached', '--binary'])).stdout,
        index
      );
      assert.equal(
        (await f.command(['for-each-ref', 'refs/tags'], f.remote)).stdout,
        ''
      );
      const pushes = f.calls.filter((args) => args.includes('push'));
      assert.equal(pushes.length, 1);
      assert.ok(pushes[0].includes('--no-follow-tags'));
      assert.ok(pushes[0].includes('--no-verify'));
    })
);

test(
  'repeated publication review accepts the same canonical repository without Git replay',
  { timeout: 20000 },
  async () =>
    withCvPublicationFixture(async (f) => {
      const input = {
        ...f.input,
        repository: path.join(f.repository, '..', 'repository', '.'),
      };
      const first = await f.service['cv-publish-plan'](input);
      const count = f.calls.length;
      assert.deepEqual(await f.service['cv-publish-plan'](input), first);
      assert.equal(f.calls.length, count);
    })
);

test(
  'a remote URL changed after the commit checkpoint cannot receive a push',
  { timeout: 20000 },
  async () => {
    let fixture;
    await withCvPublicationFixture(
      async (f) => {
        fixture = f;
        const { publication } = await f.service['cv-publish-plan'](f.input);
        const answer = await f.service['cv-publish']({
          requestId: publication.requestId,
          confirmation: publication.confirmation,
          publish: true,
        });
        assert.equal(answer.publication.state, 'uncertain');
        assert.equal(
          f.calls.some((args) => args.includes('push')),
          false
        );
        assert.equal(
          (
            await f.command(['rev-parse', 'refs/heads/main'], f.remote)
          ).stdout.trim(),
          publication.base
        );
      },
      {
        intercept: async ({ args, proceed }) => {
          const answer = await proceed();
          if (args.includes('update-ref')) {
            await fixture.command([
              'remote',
              'set-url',
              '--push',
              'origin',
              fixture.repository,
            ]);
          }
          return answer;
        },
      }
    );
  }
);
