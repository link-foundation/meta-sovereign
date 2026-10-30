// Constant-cost counters, never heap snapshots or archive scans. Sampling is
// infrequent and its timer cannot keep a retiring application worker alive.
import { performance } from 'node:perf_hooks';
import { getHeapStatistics } from 'node:v8';

const GiB = 1024 ** 3;
const optional = (read, fallback) => {
  try {
    return read();
  } catch {
    return fallback;
  }
};
const runtimeSample = () => ({
  ...process.memoryUsage(),
  cpu: process.cpuUsage(),
  heapLimit: optional(() => getHeapStatistics().heap_size_limit, 0),
  peakRssBytes: optional(() => process.resourceUsage().maxRSS * 1024, 0),
  loop: optional(() => performance.eventLoopUtilization?.(), null),
});

const loopUtilization = (current, before) => {
  const active = (current?.active ?? 0) - (before?.active ?? 0);
  const idle = (current?.idle ?? 0) - (before?.idle ?? 0);
  return active + idle > 0 ? active / (active + idle) : 0;
};

export const startResourceDiagnostics = ({
  log,
  phase = 'active',
  build = null,
  intervalMs = 30_000,
  read = runtimeSample,
  now = () => performance.now(),
  extra = () => ({}),
  rssLimit = 3 * GiB,
  cpuLimit = 85,
  cpuSamples = 2,
  automatic = true,
} = {}) => {
  let before = read();
  let at = now();
  let highCpu = 0;
  let high = false;
  let stopped = false;
  const emit = (entry) => {
    try {
      log?.({ pid: process.pid, phase, build, ...entry });
    } catch {
      /* Reporting a resource problem must never crash the worker. */
    }
  };
  const sample = (event = 'server_resources') => {
    if (stopped) {
      return null;
    }
    const current = read();
    const time = now();
    const elapsed = Math.max(1, time - at);
    const cpu = Math.max(
      0,
      current.cpu.user +
        current.cpu.system -
        before.cpu.user -
        before.cpu.system
    );
    const cpuPercent = Math.round((cpu / elapsed / 10) * 10) / 10;
    highCpu = cpuPercent >= cpuLimit ? highCpu + 1 : 0;
    const memoryHigh =
      current.rss >= rssLimit ||
      (current.heapLimit > 0 && current.heapUsed >= current.heapLimit * 0.85);
    const isHigh = memoryHigh || highCpu >= cpuSamples;
    const entry = {
      event,
      level: isHigh ? 'warn' : 'debug',
      cpuPercent,
      rssBytes: current.rss,
      peakRssBytes: current.peakRssBytes,
      heapUsedBytes: current.heapUsed,
      heapTotalBytes: current.heapTotal,
      heapLimitBytes: current.heapLimit,
      externalBytes: current.external,
      arrayBufferBytes: current.arrayBuffers,
      rssGrowthBytes: current.rss - before.rss,
      schedulerLagMs: Math.max(0, Math.round(elapsed - intervalMs)),
      eventLoopUtilization: loopUtilization(current.loop, before.loop),
      ...extra(),
    };
    emit(entry);
    if (isHigh !== high) {
      emit({
        ...entry,
        event: isHigh ? 'server_resource_high' : 'server_resource_recovered',
        cpuHigh: highCpu >= cpuSamples,
        memoryHigh,
      });
    }
    before = current;
    at = time;
    high = isHigh;
    return entry;
  };
  sample('server_resource_baseline');
  const timer = automatic ? globalThis.setInterval(sample, intervalMs) : null;
  timer?.unref?.();
  return {
    sample,
    setPhase(next) {
      phase = next;
      sample('server_resource_phase');
    },
    stop() {
      stopped = true;
      globalThis.clearInterval(timer);
    },
  };
};
