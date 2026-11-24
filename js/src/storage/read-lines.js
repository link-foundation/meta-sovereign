import { createInterface } from 'node:readline';

// A readline iterator can finish before its owned input releases its descriptor.
export async function* ownedLines(input) {
  const trace = process.env.MS_STORAGE_DEBUG === '1';
  const closed = input.closed
    ? Promise.resolve()
    : new Promise((resolve) => input.once('close', resolve));
  const reader = createInterface({ input, crlfDelay: Infinity });
  try {
    if (trace) {
      console.debug('[storage-reader] opened');
    }
    yield* reader;
  } finally {
    reader.close();
    input.destroy();
    if (trace) {
      console.debug('[storage-reader] awaiting close');
    }
    await closed;
    if (trace) {
      console.debug('[storage-reader] closed');
    }
  }
}
