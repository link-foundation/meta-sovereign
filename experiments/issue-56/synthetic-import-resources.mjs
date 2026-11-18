// Preloaded only into an isolated finite regression process. No CPU or memory
// load is created: each sample sees a synthetic CPU counter increment instead.
let user = 0;
process.cpuUsage = () => ({ user: (user += 1_000_000_000_000), system: 0 });
process.memoryUsage = () => ({
  rss: 0,
  heapUsed: 0,
  heapTotal: 0,
  external: 0,
  arrayBuffers: 0,
});
