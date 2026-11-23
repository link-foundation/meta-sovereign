import assert from 'node:assert/strict';
import { appendFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {
  linkedinPositionReference,
  linkedinPositionReviewFixture,
} from '../../experiments/issue-56/linkedin-position-review-fixture.mjs';
import { linkedinPositionFixtureUrl } from '../../experiments/issue-56/linkedin-experience-fixture.mjs';
import { saveExperienceDocument } from '../src/cv/experience-store.js';
import { createCvCommands } from '../src/cli/cv-commands.js';
import { startServer } from '../src/server/index.js';
import {
  LINO_BINARY,
  LINO_TEXT,
  encodeWire,
  readWireResponse,
} from '../src/transport/lino.js';
import {
  authorizedLinkedinPosition,
  createLinkedinPositionReviews,
} from '../src/cv/linkedin-position-review.js';

test('stage and approve only the selected native LinkedIn position or Add link', async () => {
  const fixture = await linkedinPositionReviewFixture();
  try {
    const { row, calls, store } = fixture;
    const service = createLinkedinPositionReviews(fixture);
    const before = calls.length;
    const input = linkedinPositionReference(row, 'update');
    const update = await service.stage(input);
    assert.equal(update.editor, linkedinPositionFixtureUrl('1101'));
    assert.equal(update.operation, 'update');
    assert.equal(update.browserSlot, 'linkedin-experience');
    assert.equal(update.phase, 'draft');
    assert.equal(update.providerSaved, false);
    assert.equal(update.baseline.description, 'Worked on Rust and PostgreSQL.');
    assert.deepEqual(update.fields, { description: 'Reviewed description.' });
    assert.deepEqual(update.skills, ['PostgreSQL']);
    assert.deepEqual(update.media, {
      url: 'https://example.test/portfolio?mode=work',
      title: 'Fixture Company',
    });
    assert.equal(
      await store.get(`cv-linkedin-position:${update.fingerprint}`),
      null
    );
    assert.deepEqual(await service.stage(input), update);
    const detached = await service.stored({ fingerprint: update.fingerprint });
    detached.fields.description = 'Changed outside storage.';
    assert.deepEqual(
      await service.stored({ fingerprint: update.fingerprint }),
      update
    );
    await assert.rejects(
      authorizedLinkedinPosition(fixture, update.fingerprint),
      {
        code: 'cv-linkedin-position-review',
      }
    );
    const approval = { fingerprint: update.fingerprint };
    const flush = store.flush;
    store.flush = async () => {
      throw new Error('Fixture refused approval flush');
    };
    await assert.rejects(service.review(approval), /refused approval flush/u);
    store.flush = flush;
    assert.deepEqual(await service.stored(approval), update);
    const reviewed = await service.review(approval);
    assert.equal(reviewed.phase, 'reviewed');
    assert.equal(reviewed.providerSaved, false);
    assert.equal(reviewed.draftFingerprint, update.fingerprint);
    assert.deepEqual(await service.review(approval), reviewed);
    assert.deepEqual(
      await authorizedLinkedinPosition(fixture, reviewed.fingerprint),
      reviewed
    );
    const add = await service.stage(linkedinPositionReference(row, 'add'));
    assert.equal(add.editor, linkedinPositionFixtureUrl('new'));
    assert.equal(add.operation, 'add');
    assert.equal(add.baseline.title, '');
    assert.deepEqual(add.fields, {
      company: 'Standalone company',
      title: 'Developer',
      start: '2016-04',
      end: '2018-01',
      current: false,
    });
    await assert.rejects(
      service.stage(linkedinPositionReference(row, 'keep')),
      {
        code: 'cv-linkedin-position-conflict',
      }
    );
    assert.equal(calls.length, before);
  } finally {
    await fixture.close();
  }
});

test('an imported URL or changed native export cannot authorize a position draft', async () => {
  const fixture = await linkedinPositionReviewFixture();
  try {
    const service = createLinkedinPositionReviews(fixture);
    const input = linkedinPositionReference(fixture.row, 'update');
    const draft = await service.stage(input);
    const reviewed = await service.review({ fingerprint: draft.fingerprint });
    await assert.rejects(
      service.stage({ ...input, fingerprint: 'b'.repeat(64) }),
      {
        code: 'cv-linkedin-position-conflict',
      }
    );
    const target = await saveExperienceDocument(
      fixture.store,
      fixture.linkedin.document
    );
    const imported = await fixture.complete({ target });
    await assert.rejects(
      service.stage(linkedinPositionReference(imported, 'update')),
      {
        code: 'cv-linkedin-position-source',
      }
    );
    await appendFile(
      path.join(
        fixture.artifactRoot,
        draft.target.exportRequestId,
        'linkedin-experience.json'
      ),
      ' '
    );
    await assert.rejects(service.stage(input), {
      code: 'cv-linkedin-position-evidence',
    });
    await assert.rejects(
      authorizedLinkedinPosition(fixture, reviewed.fingerprint),
      {
        code: 'cv-linkedin-position-evidence',
      }
    );
    assert.deepEqual(
      await service.stored({ fingerprint: reviewed.fingerprint }),
      reviewed
    );
  } finally {
    await fixture.close();
  }
});

test('CLI and both Lino encodings stage and recover the same private review', async () => {
  const fixture = await linkedinPositionReviewFixture();
  const { store, artifactRoot } = fixture;
  const server = await startServer({
    port: 0,
    store,
    cv: { experience: { artifactRoot } },
    enableHandlers: false,
    enableSync: false,
    telegramAccount: false,
    automations: { scheduler: false },
  });
  try {
    const { requestId, fingerprint, jobIndex } = linkedinPositionReference(
      fixture.row,
      'update'
    );
    const commands = createCvCommands({
      openStore: async () => store,
      live: { experience: { artifactRoot } },
    });
    let draft;
    assert.equal(
      await commands['cv-experience-linkedin-position-stage'](
        {
          'plan-request-id': requestId,
          fingerprint,
          'job-index': String(jobIndex),
        },
        (output) => {
          draft = JSON.parse(output);
        }
      ),
      0
    );
    assert.equal(draft.phase, 'draft');
    const base = `http://127.0.0.1:${server.port}/api/cv/experience/linkedin-position-`;
    for (const type of [LINO_TEXT, LINO_BINARY]) {
      const response = await fetch(`${base}stage`, {
        method: 'POST',
        headers: { accept: type, 'content-type': type },
        body: encodeWire({ requestId, fingerprint, jobIndex }, type),
      });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('cache-control'), 'private, no-store');
      assert.deepEqual(await readWireResponse(response), draft);
      const approval = { fingerprint: draft.fingerprint };
      const refused = await fetch(`${base}review`, {
        method: 'POST',
        headers: {
          accept: type,
          'content-type': type,
          origin: 'https://untrusted.example',
        },
        body: encodeWire(approval, type),
      });
      assert.equal(refused.status, 403);
      const reviewed = await fetch(`${base}review`, {
        method: 'POST',
        headers: { accept: type, 'content-type': type },
        body: encodeWire(approval, type),
      });
      assert.equal(reviewed.status, 200);
      const plan = await readWireResponse(reviewed);
      assert.equal(plan.phase, 'reviewed');
      const recovered = await fetch(
        `${base}stored?fingerprint=${plan.fingerprint}`,
        {
          headers: { accept: type },
        }
      );
      assert.equal(recovered.status, 200);
      assert.deepEqual(await readWireResponse(recovered), plan);
    }
    assert.equal(fixture.calls.filter(([name]) => name === 'open').length, 1);
  } finally {
    await server.close();
    await fixture.close();
  }
});
