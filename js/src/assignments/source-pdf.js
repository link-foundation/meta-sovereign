import { Worker } from 'node:worker_threads';
import { isAssignmentPdf, readAssignmentPdfBytes } from './source-pdf-bytes.js';
import { PDF_ASSIGNMENT_SCOPE } from './source.js';
import { assignmentFailure, assignmentSourceUrl } from './validation.js';

const unreadablePdf = () =>
  assignmentFailure(
    'source-unreadable',
    'The complete PDF text could not be read.'
  );

const parseAssignmentPdf = async (data, signal) => {
  signal.throwIfAborted();
  const worker = new Worker(
    new URL('./source-pdf-worker.js', import.meta.url),
    {
      workerData: data,
      transferList: [data.buffer],
      resourceLimits: { maxOldGenerationSizeMb: 64, stackSizeMb: 2 },
    }
  );
  let abort;
  const timer = globalThis.AbortSignal.timeout(10000);
  const stop = globalThis.AbortSignal.any([signal, timer]);
  try {
    return await new Promise((resolve, reject) => {
      abort = () => reject(stop.reason);
      stop.addEventListener('abort', abort, { once: true });
      worker.once('message', resolve);
      worker.once('error', reject);
      worker.once('exit', () => reject(unreadablePdf()));
    });
  } finally {
    stop.removeEventListener('abort', abort);
    await worker.terminate();
  }
};

/** Use only a successful PDF response observed during the owned navigation. */
export const readAssignmentPdf = async ({
  session,
  response,
  downloadUrl,
  signal,
  check,
}) => {
  const receivedPdf =
    response?.status() === 200 && isAssignmentPdf(response.headers?.() ?? {});
  if (!receivedPdf && (!downloadUrl || response?.url?.() === downloadUrl)) {
    return undefined;
  }
  let url;
  let text;
  try {
    url = assignmentSourceUrl(receivedPdf ? response.url() : downloadUrl);
    const bytes = await readAssignmentPdfBytes(session, url, check);
    if (bytes) {
      text = await parseAssignmentPdf(bytes, signal);
    }
  } catch {
    check();
    throw unreadablePdf();
  }
  if (!text) {
    throw unreadablePdf();
  }
  return { url, title: '', text, complete: true, scope: PDF_ASSIGNMENT_SCOPE };
};
