import { createHash } from 'node:crypto';
import { formatIndented, parseIndented } from 'lino-objects-codec';
import { writeFileDurable } from '../storage/durable.js';
import {
  readRunnerProfile,
  runnerProfileData,
  validateRunnerProfile,
} from '../cli/runner-profile.js';

const documentFor = (targets) =>
  formatIndented({ id: 'runner', obj: runnerProfileData(targets) });
const snapshot = (document) => ({
  ok: true,
  revision: createHash('sha256').update(document).digest('hex'),
  document,
});
const invalid = () =>
  Object.assign(new Error('Runner profile unavailable or invalid.'), {
    code: 'INVALID_RUNNER_PROFILE',
  });

/** Called under the same lease as process control; never probes or launches. */
export const runnerProfileOperation = async (
  file,
  input,
  write = writeFileDurable
) => {
  input.signal?.throwIfAborted();
  if (input.action === 'configure') {
    if (
      typeof input.document !== 'string' ||
      Buffer.byteLength(input.document) > 65536 ||
      typeof input.revision !== 'string' ||
      !/^[a-f0-9]{64}$/.test(input.revision ?? '')
    ) {
      throw invalid();
    }
    let document;
    try {
      document = documentFor(
        validateRunnerProfile(parseIndented({ text: input.document }).obj)
      );
    } catch {
      throw invalid();
    }
    if (Buffer.byteLength(document) > 65536) {
      throw invalid();
    }
    const previous = snapshot(
      documentFor(await readRunnerProfile(file, { optional: true }))
    );
    if (previous.revision !== input.revision) {
      return { ok: false, code: 'runner-profile-conflict' };
    }
    input.signal?.throwIfAborted();
    await write(file, document);
    return snapshot(document);
  }
  return snapshot(
    documentFor(await readRunnerProfile(file, { optional: true }))
  );
};
