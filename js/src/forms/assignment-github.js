import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { formFailure } from './options.js';
export const createAssignmentGithubVerifier =
  ({ run = promisify(execFile) } = {}) =>
  async (name, { signal } = {}) => {
    let stdout;
    try {
      ({ stdout } = await run(
        'gh',
        ['api', '--method', 'GET', `repos/${name}`],
        { signal, timeout: 30000, maxBuffer: 128 * 1024, windowsHide: true }
      ));
    } catch (error) {
      throw formFailure(
        signal?.aborted
          ? 'form-stopped'
          : error.code === 'ENOENT'
            ? 'form-assignment-unavailable'
            : 'form-assignment-unverified',
        'GitHub did not confirm this repository. Check gh authentication and repository access.'
      );
    }
    try {
      return JSON.parse(stdout);
    } catch {
      throw formFailure(
        'form-assignment-unverified',
        'GitHub returned an invalid repository receipt.'
      );
    }
  };

export const verifyAssignmentRepository = createAssignmentGithubVerifier();
