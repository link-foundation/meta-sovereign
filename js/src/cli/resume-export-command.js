import { setTimeout as delay } from 'node:timers/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { promises as fs } from 'node:fs';

/** Explicit copies use a fresh private subdirectory; existing output is never replaced. */
const copyExports = async (service, job, output) => {
  if (!output || !job.results.length) {
    return null;
  }
  const parent = path.resolve(output);
  await fs.mkdir(parent, { recursive: true, mode: 0o700 });
  const folder = path.join(parent, `hh-resumes-${randomUUID()}`);
  await fs.mkdir(folder, { mode: 0o700 });
  for (const result of job.results) {
    const destination = path.join(folder, result.hash);
    await fs.mkdir(destination, { mode: 0o700 });
    for (const file of result.files) {
      const verified = await service['resume-export-file']({
        ...result,
        name: file.name,
      });
      await fs.writeFile(path.join(destination, file.name), verified.bytes, {
        flag: 'wx',
        mode: 0o600,
      });
    }
  }
  return folder;
};

export const foregroundResumeExport = async (service, input, output) => {
  let cancelled = false;
  const cancel = () => {
    cancelled = true;
    service.cancel().catch(() => {});
  };
  process.once('SIGINT', cancel);
  process.once('SIGTERM', cancel);
  try {
    let job = await service['resume-export'](input);
    while (!cancelled && job.state === 'running') {
      await delay(250);
      job = await service['resume-export-status']({
        requestId: input.requestId,
      });
    }
    if (cancelled) {
      await service.cancel();
      job = await service['resume-export-status']({
        requestId: input.requestId,
      });
    }
    return { ...job, output: await copyExports(service, job, output) };
  } finally {
    process.removeListener('SIGINT', cancel);
    process.removeListener('SIGTERM', cancel);
  }
};
