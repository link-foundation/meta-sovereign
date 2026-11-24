import assert from 'node:assert/strict';
import path from 'node:path';
import { runAssignmentCommand } from '../../js/src/assignments/commands.js';
import { withCvPublicationFixture } from './cv-publication-fixture.mjs';
import { seedExperiencePublication } from './experience-publication-fixture.mjs';

/** A finite native Git comparison in disposable local repositories. */
export const verifyPublicationLongPaths = async ({ legacy = false } = {}) => {
  let refusedOperation;
  let filenameTooLong = false;
  let receipt;
  await withCvPublicationFixture(
    async (fixture) => {
      await fixture.command(['config', 'core.longpaths', 'false']);
      const source = await seedExperiencePublication(fixture);
      const { publication } = await fixture.service['cv-publish-plan']({
        ...source.input,
        directory: `examples/${'snapshot-directory-'.repeat(5)}`,
      });
      const file = publication.files[0];
      const pathLength = path.join(publication.repository, file.path).length;
      assert(pathLength > 260 && pathLength < 600, pathLength);
      const staged = (await fixture.command(['diff', '--cached', '--binary']))
        .stdout;
      const answer = await fixture.service['cv-publish']({
        requestId: publication.requestId,
        confirmation: publication.confirmation,
        publish: true,
      });
      if (legacy && process.platform === 'win32') {
        assert.equal(answer.publication.state, 'uncertain');
        assert.equal(filenameTooLong, true, refusedOperation);
        assert.equal(
          fixture.calls.some((args) => args.includes('push')),
          false
        );
        assert.equal(
          (
            await fixture.command(
              ['rev-parse', 'refs/heads/main'],
              fixture.remote
            )
          ).stdout.trim(),
          publication.base
        );
      } else {
        assert.equal(answer.publication.state, 'published');
        assert.equal(
          (
            await fixture.command(
              ['show', `refs/heads/main:${file.path}`],
              fixture.remote
            )
          ).stdout,
          file.content
        );
        assert.equal(
          (await fixture.command(['diff', '--cached', '--binary'])).stdout,
          staged
        );
        const calls = fixture.calls.length;
        await fixture.service['cv-publish-status'](source.input);
        assert.equal(fixture.calls.length, calls);
      }
      assert.equal(
        (
          await fixture.command(['config', '--get', 'core.longpaths'])
        ).stdout.trim(),
        'false'
      );
      receipt = {
        platform: process.platform,
        legacy,
        pathLength,
        filenameTooLong,
        refusedOperation,
        state: answer.publication.state,
        pushes: fixture.calls.filter((args) => args.includes('push')).length,
        repositoryConfigUnchanged: true,
      };
    },
    {
      intercept: async ({ name, args, options, proceed }) => {
        if (!legacy) {
          return proceed();
        }
        try {
          return await runAssignmentCommand(
            name,
            [
              '-c',
              'core.longpaths=false',
              ...args.map((arg) =>
                arg === 'core.longpaths=true' ? 'core.longpaths=false' : arg
              ),
            ],
            options
          );
        } catch (error) {
          refusedOperation = args.includes('diff') ? 'diff' : 'other';
          filenameTooLong ||= /filename too long/iu.test(
            error.commandError ?? ''
          );
          throw error;
        }
      },
    }
  );
  return receipt;
};
