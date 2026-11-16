import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../src/storage/index.js';
import { startServer } from '../src/server/index.js';
import {
  LINO_TEXT,
  LINO_BINARY,
  encodeWire,
  readWireResponse,
} from '../src/transport/lino.js';
import { experienceDocumentFixture } from '../../experiments/issue-56/experience-document-fixture.mjs';
import { technologyFixture } from '../../experiments/issue-56/technology-fixture.mjs';

test(
  'HTTP snapshot import, private reads and revision comparison preserve native metadata in both Lino formats',
  { timeout: 10000 },
  async () => {
    const store = createMemoryStore();
    const server = await startServer({
      port: 0,
      store,
      enableHandlers: false,
      enableSync: false,
      telegramAccount: false,
      automations: { scheduler: false },
    });
    const base = `http://127.0.0.1:${server.port}/api/cv/experience/`;
    const request = async (operation, type, input, extra = {}) => {
      const response = await fetch(`${base}${operation}`, {
        headers: {
          accept: type,
          ...(input ? { 'content-type': type } : {}),
          ...extra,
        },
        ...(input ? { method: 'POST', body: encodeWire(input, type) } : {}),
      });
      if (response.status !== 403) {
        assert.equal(
          response.headers.get('cache-control'),
          'private, no-store'
        );
      }
      return {
        status: response.status,
        value: await readWireResponse(response),
      };
    };
    try {
      for (const type of [LINO_TEXT, LINO_BINARY]) {
        const revisions = {};
        for (const platform of ['hh', 'linkedin']) {
          const document = experienceDocumentFixture(platform);
          const imported = await request('import', type, { document });
          assert.equal(imported.status, 200);
          assert.equal(imported.value.provenance.kind, 'imported');
          revisions[platform] = imported.value.revision;
          const read = await request(
            `document?revision=${imported.value.revision}`,
            type
          );
          assert.equal(read.status, 200);
          assert.deepEqual(read.value.document, document);
        }
        const before = await store.query();
        const compared = await request('compare', type, revisions);
        assert.equal(compared.status, 200);
        assert.equal(compared.value.hh, revisions.hh);
        assert.deepEqual(
          compared.value.comparison.pairs[0].left.native,
          experienceDocumentFixture().jobs[0].native
        );
        assert.deepEqual(await store.query(), before);
        assert.equal(
          (
            await request('compare', type, {
              hh: revisions.linkedin,
              linkedin: revisions.hh,
            })
          ).status,
          400
        );
        const listed = await request('stored', type);
        assert.equal(listed.value.entries.length, 2);
        assert.equal(listed.value.entries[0].document, undefined);
        for (const operation of ['import', 'from-hh', 'compare']) {
          assert.equal(
            (
              await request(
                operation,
                type,
                { document: experienceDocumentFixture() },
                { origin: 'https://untrusted.example' }
              )
            ).status,
            403
          );
        }
        assert.equal((await request('import', type)).status, 405);
        assert.deepEqual(await store.query(), before);
      }
    } finally {
      await server.close();
    }
  }
);

test(
  'HTTP HH conversion requires a verified existing export and retains the private receipt identity',
  { timeout: 10000 },
  async () => {
    const fixture = await technologyFixture();
    const server = await startServer({
      port: 0,
      store: fixture.store,
      vacancies: { artifactRoot: fixture.artifactRoot },
      enableHandlers: false,
      enableSync: false,
      telegramAccount: false,
      automations: { scheduler: false },
    });
    try {
      const response = await fetch(
        `http://127.0.0.1:${server.port}/api/cv/experience/from-hh`,
        {
          method: 'POST',
          headers: { accept: LINO_BINARY, 'content-type': LINO_TEXT },
          body: encodeWire(fixture.input),
        }
      );
      assert.equal(response.status, 200);
      const result = await readWireResponse(response);
      assert.equal(result.provenance.kind, 'hh-export');
      assert.deepEqual(result.document.jobs[0].native, fixture.cv.jobs[0]);
    } finally {
      await server.close();
      await fixture.close();
    }
  }
);
