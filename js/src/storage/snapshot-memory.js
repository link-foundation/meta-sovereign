// Main-isolate memoryUsage excludes other worker heaps. Keep their latest
// constant-cost reports visible without scanning messages or taking profiles.
const active = new Map();
const trace = (event, threadId) => {
  if (process.env.MS_STORAGE_DEBUG === '1') {
    console.debug(`[storage-snapshot] ${event} ${threadId}`);
  }
};
export const trackSnapshot = (threadId, engine) => {
  active.set(threadId, { threadId, engine, stage: 'opening', memory: null });
  trace('tracked', threadId);
  return {
    update: (report) => {
      if (!active.has(threadId)) {
        return;
      }
      active.set(threadId, {
        threadId,
        engine,
        stage: report.stage,
        memory: report.memory,
        at: Date.now(),
      });
    },
    stop: () => {
      trace('released', threadId);
      return active.delete(threadId);
    },
  };
};
export const snapshotMemory = () => [...active.values()];
