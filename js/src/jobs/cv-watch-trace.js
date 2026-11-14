/** Optional lifecycle diagnostics; never includes URLs, IDs, CV fields or HTML. */
export const traceCvWatch = (phase, fields = {}) => {
  if (globalThis.process?.env?.CI_CV_WATCH_DEBUG === '1') {
    console.log('[cv-watch]', JSON.stringify({ phase, ...fields }));
  }
};
