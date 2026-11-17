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
const storedDocument = (previous, targets, document) => {
  const stored = previous.encode ? previous.encode(targets) : document;
  if (Buffer.byteLength(stored) > 65536) {
    throw invalid();
  }
  return stored;
};

/** Called under the same lease as process control; never probes or launches. */
export const runnerProfileOperation = async (
  file,
  input,
  write = writeFileDurable,
  read = async () => ({
    targets: await readRunnerProfile(file, { optional: true }),
    file,
  })
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
    let targets;
    try {
      targets = validateRunnerProfile(
        parseIndented({ text: input.document }).obj
      );
      document = documentFor(targets);
    } catch {
      throw invalid();
    }
    if (Buffer.byteLength(document) > 65536) {
      throw invalid();
    }
    const previous = await read();
    if (snapshot(documentFor(previous.targets)).revision !== input.revision) {
      return { ok: false, code: 'runner-profile-conflict' };
    }
    input.signal?.throwIfAborted();
    await write(previous.file, storedDocument(previous, targets, document));
    return snapshot(document);
  }
  return snapshot(documentFor((await read()).targets));
};
