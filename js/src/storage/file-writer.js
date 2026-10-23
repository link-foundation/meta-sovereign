/**
 * Coalesced whole-file writer shared by the file-backed stores.
 *
 * Every `request()` resolves once a write that *started after* the request
 * has finished, so callers keep write-through durability, while requests
 * that arrive during an in-flight write share a single follow-up write
 * instead of rewriting the file once each.
 */

import { writeFileDurable } from './durable.js';

export const createFileWriter = (filePath, render) => {
  let inFlight = null;
  let queued = null;

  const writeOnce = async () => {
    const data = await render();
    await writeFileDurable(filePath, data); // fsync + rename + dir fsync (R-Z2)
  };

  const request = () => {
    if (queued) {
      return queued;
    }
    if (!inFlight) {
      inFlight = writeOnce().finally(() => {
        inFlight = null;
      });
      return inFlight;
    }
    queued = inFlight
      .catch(() => {})
      .then(() => {
        queued = null;
        return request();
      });
    return queued;
  };

  return { request };
};
