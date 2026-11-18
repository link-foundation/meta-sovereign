/** Optional fixed-name timings; never log account data or cleanup errors. */
export const traceShutdown = (name, pending) => {
  if (process.env.MS_LIFECYCLE_DEBUG !== '1') {
    return pending;
  }
  const began = Date.now();
  console.error(`[lifecycle] stop_pending ${name}`);
  return Promise.resolve(pending).finally(() => {
    console.error(
      `[lifecycle] stop_settled ${name} after ${Date.now() - began} ms`
    );
  });
};
