import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { addAbortSignal } from 'node:stream';
import { providedAssignmentText } from '../assignments/source.js';

const byteLimit = 120000;
const invalidInstructions = () =>
  new Error(
    'Use a regular UTF-8 instruction file or piped text within 30,000 characters.'
  );

const fromFile = async (name, signal) => {
  const file = await open(name, constants.O_RDONLY | constants.O_NONBLOCK);
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > byteLimit) {
      throw invalidInstructions();
    }
    const bytes = Buffer.alloc(stat.size + 1);
    let offset = 0;
    while (offset < bytes.length) {
      signal.throwIfAborted();
      const { bytesRead } = await file.read(
        bytes,
        offset,
        bytes.length - offset
      );
      if (bytesRead === 0) {
        break;
      }
      offset += bytesRead;
    }
    if (offset !== stat.size) {
      throw invalidInstructions();
    }
    return bytes.subarray(0, offset);
  } finally {
    await file.close();
  }
};

const fromStdin = async (input, signal) => {
  if (input.isTTY) {
    throw invalidInstructions();
  }
  let offset = 0;
  const bytes = Buffer.alloc(byteLimit);
  for await (const chunk of addAbortSignal(signal, input)) {
    const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    if (offset + part.length > bytes.length) {
      throw invalidInstructions();
    }
    offset += part.copy(bytes, offset);
  }
  return bytes.subarray(0, offset);
};

export const assignmentSourceArguments = (args) => {
  const { from, url, file, source } = args;
  if (from === undefined) {
    const active =
      args.server !== undefined || args['review-slot'] !== undefined;
    return {
      file,
      url,
      standalone: !active && !file && !url && source !== undefined,
    };
  }
  if (
    typeof from !== 'string' ||
    !from.trim() ||
    file !== undefined ||
    url !== undefined
  ) {
    throw new Error('Choose --from, --file or --url for the assignment.');
  }
  if (/^https?:\/\//iu.test(from)) {
    return { url: from, standalone: false };
  }
  if (source !== undefined) {
    throw new Error('Choose one standalone instruction source.');
  }
  return { from, standalone: true };
};

export const readAssignmentCommandText = async (from, input, signal) => {
  const bytes =
    from === '-'
      ? await fromStdin(input ?? process.stdin, signal)
      : await fromFile(from, signal);
  signal.throwIfAborted();
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw invalidInstructions();
  }
  return providedAssignmentText(text);
};
