import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  stat,
  rm,
  readdir,
} from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createMemoryStore } from '../src/storage/universal.js';
import { createVacancyCommands } from '../src/cli/vacancy-commands.js';
import {
  readResumeExportFile,
  storedResumeExports,
} from '../src/jobs/resume-export-files.js';
import {
  resumeExportReceipt,
  resumeExportFixtureContent,
} from '../../experiments/issue-56/resume-export-fixture.mjs';
import { withRoutes, wirePost } from './helpers/vacancy-routes.mjs';
import { LINO_TEXT, LINO_BINARY, decodeWire } from '../src/transport/lino.js';

const withArtifacts = async (work) => {
  const artifactRoot = await mkdtemp(join(tmpdir(), 'hh-export-file-test-'));
  const store = createMemoryStore();
  const receipt = resumeExportReceipt();
  const folder = join(artifactRoot, receipt.exportId, receipt.hash);
  try {
    await mkdir(folder, { recursive: true, mode: 0o700 });
    for (const file of receipt.files) {
      await writeFile(
        join(folder, file.name),
        resumeExportFixtureContent(file.name),
        { mode: 0o600 }
      );
    }
    await store.put({
      id: `jobs-resume-artifact:${receipt.exportId}:${receipt.hash}`,
      version: 1,
      ...receipt,
    });
    await store.put({
      id: `jobs-resume-export:jobs:${receipt.hash}`,
      version: 1,
      ...receipt,
    });
    return await work({ artifactRoot, store, receipt, folder });
  } finally {
    await rm(artifactRoot, { recursive: true, force: true });
  }
};

test('private downloads require exact manifests, sizes and digests and refuse traversal or tampering', async () => {
  await withArtifacts(async (fixture) => {
    const { receipt, folder, store } = fixture;
    const input = { ...receipt, name: 'resume.pdf' };
    assert.deepEqual(
      (await readResumeExportFile(fixture, input)).bytes,
      resumeExportFixtureContent('resume.pdf')
    );
    // Windows stat does not expose POSIX owner/group permission distinctions.
    if (process.platform !== 'win32') {
      assert.equal(
        (await stat(join(folder, 'resume.pdf'))).mode & 0o777,
        0o600
      );
    }
    for (const invalid of [
      { ...input, name: '../resume.pdf' },
      { ...input, hash: '../english' },
      { ...input, exportId: 'unknown' },
    ]) {
      await assert.rejects(readResumeExportFile(fixture, invalid));
    }
    const original = await readFile(join(folder, 'resume.pdf'));
    await writeFile(
      join(folder, 'resume.pdf'),
      Buffer.alloc(original.length, 120)
    );
    await assert.rejects(readResumeExportFile(fixture, input), {
      code: 'jobs-export-unconfirmed',
    });
    await writeFile(
      join(folder, 'resume.pdf'),
      Buffer.alloc(original.length + 1, 120)
    );
    await assert.rejects(readResumeExportFile(fixture, input), {
      code: 'jobs-export-unconfirmed',
    });
    assert.equal((await storedResumeExports(store)).exports.length, 1);
    await store.put({
      ...receipt,
      id: 'jobs-resume-export:forged',
      version: 1,
    });
    await assert.rejects(storedResumeExports(store));
  });
});

for (const type of [LINO_TEXT, LINO_BINARY]) {
  test(
    `durable export admission, status and private attachments work over ${type}`,
    { timeout: 10000 },
    async () => {
      await withArtifacts(async ({ artifactRoot, store, receipt }) => {
        let reads = 0;
        await withRoutes(
          async (base) => {
            const input = { requestId: 'route-export' };
            const admitted = await wirePost(base, 'resume-export', input, type);
            assert.equal(admitted.status, 200);
            assert.equal(admitted.value.state, 'running');
            const statusResponse = await fetch(
              `${base}/api/vacancies/resume-export-status?requestId=route-export`,
              { headers: { accept: type } }
            );
            const job = decodeWire(
              await statusResponse.arrayBuffer(),
              statusResponse.headers.get('content-type')
            );
            assert.equal(job.state, 'completed');
            await wirePost(base, 'resume-export', input, type);
            assert.equal(reads, 1);
            const query = new URLSearchParams({
              exportId: receipt.exportId,
              hash: receipt.hash,
              name: 'resume.pdf',
            });
            const url = `${base}/api/vacancies/resume-export-file?${query}`;
            const file = await fetch(url);
            assert.equal(file.status, 200);
            assert.equal(
              file.headers.get('content-disposition'),
              'attachment; filename="resume.pdf"'
            );
            assert.equal(
              file.headers.get('cache-control'),
              'private, no-store'
            );
            assert.equal(file.headers.get('x-content-type-options'), 'nosniff');
            assert.deepEqual(
              Buffer.from(await file.arrayBuffer()),
              resumeExportFixtureContent('resume.pdf')
            );
            const refused = await fetch(url, {
              headers: {
                'sec-fetch-site': 'cross-site',
                origin: 'https://evil.test',
              },
            });
            assert.equal(refused.status, 403);
            assert.equal(
              (
                await wirePost(
                  base,
                  'resume-export',
                  { requestId: 'cross-site' },
                  type,
                  { origin: 'https://evil.test' }
                )
              ).status,
              403
            );
            assert.equal(reads, 1);
          },
          {
            store,
            service: {
              artifactRoot,
              readResumeExports: async (_options, progress) => {
                reads++;
                await progress({ total: 1 });
                await progress({ result: receipt });
              },
            },
          }
        );
      });
    }
  );
}

test(
  'foreground CLI waits for export completion and copies only verified files into a fresh private directory',
  { timeout: 5000 },
  async () => {
    await withArtifacts(async ({ artifactRoot, store, receipt }) => {
      const commands = createVacancyCommands({
        openStore: async () => store,
        artifactRoot,
        readResumeExports: async (_options, progress) => {
          await progress({ total: 1 });
          await progress({ result: receipt });
        },
      });
      const logs = [];
      assert.equal(
        await commands['vacancies-resume-export'](
          {
            'request-id': 'cli-export',
            formats: 'pdf',
            out: join(artifactRoot, 'copies'),
          },
          (value) => logs.push(value)
        ),
        0
      );
      const output = decodeWire(logs[0], LINO_TEXT);
      assert.equal(output.state, 'completed');
      const folder = output.output;
      if (process.platform !== 'win32') {
        assert.equal((await stat(folder)).mode & 0o777, 0o700);
      }
      assert.equal((await readdir(join(folder, receipt.hash))).length, 8);
      assert.deepEqual(
        await readFile(join(folder, receipt.hash, 'resume.pdf')),
        resumeExportFixtureContent('resume.pdf')
      );
      const status = [];
      assert.equal(
        await commands['vacancies-resume-export-status'](
          { 'request-id': 'cli-export' },
          (value) => status.push(value)
        ),
        0
      );
      assert.equal(decodeWire(status[0], LINO_TEXT).state, 'completed');
    });
  }
);
