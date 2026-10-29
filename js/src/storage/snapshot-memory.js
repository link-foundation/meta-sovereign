// Main-isolate memoryUsage excludes other worker heaps. Keep their latest
// constant-cost reports visible without scanning messages or taking profiles.
const active = new Map();
export const trackSnapshot = (threadId, engine) => {
  active.set(threadId, { threadId, engine, stage: 'opening', memory: null });
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
    stop: () => active.delete(threadId),
  };
};
export const snapshotMemory = () => [...active.values()];
