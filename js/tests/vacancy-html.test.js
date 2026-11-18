import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../src/storage/universal.js';
import {
  createBrowserStore,
  createInMemoryDriver,
} from '../src/storage/browser-store.js';
import { createAssignmentVacancyReader } from '../src/assignments/vacancy-reader.js';
import { resolveAssignmentVacancy } from '../src/assignments/vacancy.js';
import { vacancyContent } from '../src/assignments/vacancy-content.js';
import { createVacancyService } from '../src/jobs/service.js';
import { createVacancyCommands } from '../src/cli/vacancy-commands.js';
import { createVacancyApi } from '../src/web/vacancy-api.js';
import { analyzeTechnologies } from '../src/jobs/technology-analysis.js';
import {
  technologyCatalog,
  defaultTechnologyEntries,
} from '../src/jobs/technology-catalog.js';
import { technologyCv } from '../../experiments/issue-56/technology-fixture.mjs';
import { LINO_TEXT, LINO_BINARY, decodeWire } from '../src/transport/lino.js';
import { withRoutes, wirePost } from './helpers/vacancy-routes.mjs';
import {
  vacancySnapshotFixture,
  fakeVacancySession,
} from '../../experiments/issue-56/vacancy-fixture.mjs';

const descriptionHtml =
  ' \n<section><h2>Requirements</h2><ul><li>Python &amp; SQL</li></ul>\n<p>Final employer paragraph.</p></section>\n ';
const snapshot = () => ({ ...vacancySnapshotFixture(), descriptionHtml });
const makeService = (store, readVacancy = async () => snapshot()) =>
  createVacancyService({ store, readVacancy });

test('vacancy reader preserves exact description HTML and closes its owned session', async () => {
  const calls = [];
  const read = createAssignmentVacancyReader({
    store: {},
    openSession: async () => fakeVacancySession(snapshot(), calls),
  });
  assert.equal((await read(snapshot().url)).descriptionHtml, descriptionHtml);
  assert.equal(calls.at(-1), 'closed');
});

test('vacancy HTML survives acknowledged storage and a fresh browser-store opening', async () => {
  const driver = createInMemoryDriver();
  let store = await createBrowserStore({ driver });
  let service = makeService(store);
  try {
    const collected = await service.collect({ url: snapshot().url });
    assert.equal(collected.descriptionHtml, descriptionHtml);
    await service.stop();
    await store.close();
    store = await createBrowserStore({ driver });
    service = makeService(store, () =>
      assert.fail('No provider read on recovery')
    );
    const recovered = (await service.stored()).entries[0];
    assert.equal(recovered.descriptionHtml, descriptionHtml);
    assert.equal(recovered.description, snapshot().description);
    assert.equal(
      (await service.collect({ url: snapshot().url })).descriptionHtml,
      descriptionHtml
    );
  } finally {
    await service.stop();
    await store.close();
  }
});

for (const [name, value] of [
  ['null', null],
  ['non-text', 7],
  ['empty', ''],
  ['blank', '\n\t '],
  ['over limit', 'x'.repeat(120001)],
  ['control character', '<p>text\u0000</p>'],
  ['C1 control character', '<p>text\u0085</p>'],
]) {
  test(`invalid ${name} HTML cannot replace an acknowledged vacancy`, async () => {
    const store = createMemoryStore();
    let current = snapshot();
    const service = makeService(store, async () => current);
    try {
      await service.collect({ url: current.url });
      const before = await service.stored();
      current = { ...current, descriptionHtml: value };
      await assert.rejects(
        service.collect({ url: current.url, refresh: true })
      );
      assert.deepEqual(await service.stored(), before);
    } finally {
      await service.stop();
    }
  });
}

test('HTML is bounded without truncation or rewriting', () => {
  const exact = ` <p>${'x'.repeat(119991)}</p> `;
  assert.equal(exact.length, 120000);
  assert.equal(
    vacancyContent({ ...snapshot(), descriptionHtml: exact }).descriptionHtml,
    exact
  );
});

test('legacy snapshots stay valid without inventing missing HTML', () => {
  const legacy = vacancySnapshotFixture();
  assert.deepEqual(vacancyContent(legacy), legacy);
  assert.equal(Object.hasOwn(vacancyContent(legacy), 'descriptionHtml'), false);
});

test('private HTML does not change technology analysis inputs, reports or fingerprints', async () => {
  const input = {
    catalog: await technologyCatalog(defaultTechnologyEntries()),
    cv: technologyCv(),
    resume: {},
  };
  const plain = await analyzeTechnologies({
    ...input,
    vacancies: [vacancySnapshotFixture()],
  });
  const html = await analyzeTechnologies({ ...input, vacancies: [snapshot()] });
  assert.equal(html.fingerprint, plain.fingerprint);
  assert.equal(Object.hasOwn(html.vacancies[0], 'descriptionHtml'), false);
});

test('cached HTML remains private data outside the assignment model context', async () => {
  const store = createMemoryStore();
  const resolved = await resolveAssignmentVacancy(
    { store, readVacancy: async () => snapshot() },
    { vacancyUrl: snapshot().url },
    { url: 'https://example.test/task' }
  );
  assert.equal(Object.hasOwn(resolved.vacancy, 'descriptionHtml'), false);
  assert.equal(resolved.vacancy.description, snapshot().description);
  assert.equal((await store.query())[0].descriptionHtml, descriptionHtml);
});

test('vacancy CLI collect and stored return exact HTML in Lino', async () => {
  const store = createMemoryStore();
  const commands = createVacancyCommands({
    openStore: async () => store,
    readVacancy: async () => snapshot(),
  });
  const lines = [];
  assert.equal(
    await commands['vacancies-collect']({ url: snapshot().url }, (line) =>
      lines.push(line)
    ),
    0
  );
  assert.equal(decodeWire(lines.pop()).descriptionHtml, descriptionHtml);
  assert.equal(
    await commands['vacancies-stored']({}, (line) => lines.push(line)),
    0
  );
  assert.equal(
    decodeWire(lines.pop()).entries[0].descriptionHtml,
    descriptionHtml
  );
});

for (const format of [LINO_TEXT, LINO_BINARY]) {
  test(`vacancy HTTP collection and browser API retain HTML through ${format}`, async () => {
    await withRoutes(
      async (base) => {
        const result = await wirePost(
          base,
          'collect',
          { url: snapshot().url },
          format
        );
        assert.equal(result.status, 200);
        assert.equal(result.value.descriptionHtml, descriptionHtml);
        const response = await fetch(`${base}/api/vacancies/stored`, {
          headers: { accept: format },
        });
        assert.equal(response.status, 200);
        const saved = decodeWire(
          await response.arrayBuffer(),
          response.headers.get('content-type')
        );
        assert.equal(saved.entries[0].descriptionHtml, descriptionHtml);
      },
      { service: { readVacancy: async () => snapshot() } }
    );
  });
}

test('offline browser API retains acknowledged HTML without provider access', async () => {
  const store = createMemoryStore();
  const service = makeService(store);
  try {
    await service.collect({ url: snapshot().url });
    const api = createVacancyApi({
      get: async () => null,
      local: async () => store,
    });
    assert.equal(
      (await api.vacancyStored()).entries[0].descriptionHtml,
      descriptionHtml
    );
  } finally {
    await service.stop();
  }
});
