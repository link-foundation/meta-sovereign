import test from 'node:test';
import assert from 'node:assert/strict';
import { createCvPublicationGit } from '../src/jobs/cv-publication-git.js';
import { withCvPublicationFixture } from '../../experiments/issue-56/cv-publication-fixture.mjs';
import { verifyPublicationLongPaths } from '../../experiments/issue-56/publication-long-path-fixture.mjs';

test(
  'full-revision snapshot publication supports long native paths without changing repository configuration',
  { timeout: 20000 },
  async () => {
    if (process.platform === 'win32') {
      console.log(
        '[publication-long-path]',
        JSON.stringify(await verifyPublicationLongPaths({ legacy: true }))
      );
    }
    console.log(
      '[publication-long-path]',
      JSON.stringify(await verifyPublicationLongPaths())
    );
  }
);

test(
  'publication Git tracing is opt-in and never includes native paths, arguments or stderr',
  { timeout: 20000 },
  async () => {
    await withCvPublicationFixture(async (fixture) => {
      const messages = [];
      const previous = process.env.CI_CV_PUBLICATION_DEBUG;
      const log = console.error;
      const git = createCvPublicationGit({
        run: async () => {
          const error = new Error('PRIVATE_REPOSITORY');
          Object.defineProperty(error, 'commandError', {
            value: 'PRIVATE_TOKEN: Filename too long: PRIVATE_SNAPSHOT',
          });
          throw error;
        },
      });
      try {
        console.error = (...args) => messages.push(args);
        delete process.env.CI_CV_PUBLICATION_DEBUG;
        await assert.rejects(git.preview(fixture.input, []));
        assert.deepEqual(messages, []);
        process.env.CI_CV_PUBLICATION_DEBUG = '1';
        await assert.rejects(git.preview(fixture.input, []));
        assert.deepEqual(messages, [
          [
            '[cv-publication-git]',
            JSON.stringify({ operation: 'rev-parse', filenameTooLong: true }),
          ],
        ]);
      } finally {
        console.error = log;
        if (previous === undefined) {
          delete process.env.CI_CV_PUBLICATION_DEBUG;
        } else {
          process.env.CI_CV_PUBLICATION_DEBUG = previous;
        }
      }
    });
  }
);
