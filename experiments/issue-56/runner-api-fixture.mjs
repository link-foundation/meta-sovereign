import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { diagnosticServer } from './diagnostics-fixture.mjs';
import { runnerFixture, runnerProfile } from './runner-fixture.mjs';
import { validateRunnerProfile } from '../../js/src/cli/runner-profile.js';

/** One private API/control directory, no installed tools or provider account. */
export const runnerApiFixture = async (options = {}) => {
  const dir = await mkdtemp(join(tmpdir(), 'runner-api-'));
  const backend = runnerFixture(options.initial);
  let server;
  try {
    server = await diagnosticServer({
      runnerSessions: {
        directory: () => dir,
        load: async () => validateRunnerProfile(runnerProfile()),
        run: backend.run,
        ...options.control,
      },
    });
  } catch (error) {
    await rm(dir, { recursive: true, force: true });
    throw error;
  }
  return {
    ...server,
    dir,
    backend,
    close: async () => {
      try {
        await server.close();
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
  };
};
