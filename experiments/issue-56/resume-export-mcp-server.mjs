import { createServer } from 'node:http';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createMemoryStore } from '../../js/src/storage/universal.js';
import { startServer } from '../../js/src/server/index.js';
import {
  resumeExportReceipt,
  resumeExportFixtureContent,
} from './resume-export-fixture.mjs';

// Counted synthetic read boundary: native DOM/converter behavior is verified
// separately in resume-export-browser.mjs to keep independent MCP within budget.
const store = createMemoryStore();
const artifactRoot = await mkdtemp(join(tmpdir(), 'resume-export-mcp-'));
let reads = 0;
const options = [];
const server = await startServer({
  localUi: true,
  port: 0,
  tls: false,
  store,
  enableHandlers: false,
  enableSync: false,
  telegramAccount: false,
  log: null,
  automations: { scheduler: false },
  vacancies: {
    artifactRoot,
    availability: async () => ({ available: true }),
    readResumeExports: async (input, progress) => {
      reads++;
      options.push({
        browserSlot: input.browserSlot,
        resume: input.resume,
        all: input.all,
      });
      const hashes = input.all
        ? ['english', 'russian']
        : [input.resume ?? 'english'];
      await progress({ total: hashes.length });
      for (const hash of hashes) {
        input.signal.throwIfAborted();
        const result = resumeExportReceipt(hash);
        const folder = join(artifactRoot, result.exportId, hash);
        await mkdir(folder, { recursive: true, mode: 0o700 });
        for (const file of result.files) {
          await writeFile(
            join(folder, file.name),
            resumeExportFixtureContent(file.name),
            { mode: 0o600 }
          );
        }
        for (const id of [
          `jobs-resume-artifact:${result.exportId}:${hash}`,
          `jobs-resume-export:${result.browserSlot}:${hash}`,
        ]) {
          await store.put({ id, version: 1, ...result });
        }
        await progress({ result });
      }
    },
  },
});
const stats = () => ({
  reads,
  options,
  nativeBrowserReads: false,
  providerClicks: 0,
});
const control = createServer((_req, res) => {
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(stats()));
});
await new Promise((resolve) => control.listen(0, '127.0.0.1', resolve));
console.log(
  JSON.stringify({
    pid: process.pid,
    base: `http://127.0.0.1:${server.port}`,
    control: `http://127.0.0.1:${control.address().port}`,
  })
);
let closing;
const close = () =>
  (closing ??= (async () => {
    await new Promise((resolve) => control.close(resolve));
    await server.close();
    await rm(artifactRoot, { recursive: true, force: true });
    console.log(JSON.stringify(stats()));
  })());
process.once('SIGTERM', close);
process.once('SIGINT', close);
