import { getHeapStatistics } from 'node:v8';

// Constant-cost diagnostics; never build a reply index or scan the archive.
export const memoryHealth = (store) => ({
  ...process.memoryUsage(),
  heapLimit: getHeapStatistics().heap_size_limit,
  retention: store.memoryStats?.() ?? null,
});
