import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { diagnosticServer } from './diagnostics-fixture.mjs';
import { runnerFixture, runnerProfile } from './runner-fixture.mjs';
import { formatIndented } from 'lino-objects-codec';
import { writeFileDurable } from '../../js/src/storage/durable.js';

/** One private API/control directory, no installed tools or provider account. */
export const runnerApiFixture = async (options = {}) => {
  const dir = await mkdtemp(join(tmpdir(), 'runner-api-'));
  const localDir = join(dir, 'local');
  const backend = options.backend ?? runnerFixture(options.initial);
  let server;
  try {
    await writeFileDurable(
      join(dir, 'runner.lino'),
      formatIndented({ id: 'runner', obj: runnerProfile() })
    );
    if (options.overlay) {
      await writeFileDurable(
        join(localDir, 'runner.lino'),
        formatIndented({ id: 'runner', obj: options.overlay })
      );
    }
    server = await diagnosticServer({
      ...options.serverOptions,
      runnerSessions: {
        directory: () => dir,
        localDirectory: () => localDir,
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
    localDir,
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
