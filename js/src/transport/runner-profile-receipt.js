/** Project a bounded acknowledged configuration; never infer process state. */
export const runnerProfileReceipt = (value) => {
  if (
    value?.ok !== true ||
    typeof value.revision !== 'string' ||
    !/^[a-f0-9]{64}$/.test(value.revision) ||
    typeof value.document !== 'string' ||
    new TextEncoder().encode(value.document).byteLength > 65536
  ) {
    throw new Error('Runner profile was not confirmed.');
  }
  return { ok: true, revision: value.revision, document: value.document };
};
