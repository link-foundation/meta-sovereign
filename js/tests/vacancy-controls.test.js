import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createMemoryStore } from '../src/storage/universal.js';
import { createVacancyCommands } from '../src/cli/vacancy-commands.js';
import { handleVacancyRoutes } from '../src/server/routes-vacancies.js';
import { bindWire } from '../src/server/wire.js';
import { validateVacancySearch } from '../src/jobs/search-result.js';
import { hhSearchUrl } from '../src/jobs/options.js';
import { createVacancyApi } from '../src/web/vacancy-api.js';
import { VacanciesScreen } from '../src/web/vacancies-panel.js';
import {
  LINO_TEXT,
  LINO_BINARY,
  decodeWire,
  encodeWire,
} from '../src/transport/lino.js';
import { fixtureServerClose } from './helpers/fixture-server.mjs';
import { screenRenderer } from './util-render.js';
import {
  vacancySnapshotFixture,
  vacancyUrl,
  searchFixture,
} from '../../experiments/issue-56/vacancy-fixture.mjs';
import { resumeListFixture } from '../../experiments/issue-56/resume-list-fixture.mjs';

const withRoutes = async (work) => {
  const store = createMemoryStore();
  const calls = [];
  const context = {
    vacancyOptions: {
      availability: async () => ({ available: true }),
      readVacancy: async () => {
        calls.push('collect');
        return vacancySnapshotFixture();
      },
      readSearch: async (url) => {
        calls.push(url);
        return searchFixture(url);
      },
      readResumes: async () => {
        calls.push('resumes');
        return resumeListFixture();
      },
    },
  };
  const server = http.createServer(async (req, res) => {
    bindWire(req, res);
    const handled = await handleVacancyRoutes(
      store,
      req,
      res,
      new URL(req.url, 'http://localhost').pathname,
      context
    );
    if (!handled) {
      res.writeHead(404);
      res.end();
    }
  });
  const close = fixtureServerClose(server, 'vacancies');
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    return await work(`http://127.0.0.1:${server.address().port}`, calls);
  } finally {
    await context.vacancies?.stop();
    await close();
  }
};
const wirePost = async (base, path, value, type, headers = {}) => {
  const response = await fetch(`${base}/api/vacancies/${path}`, {
    method: 'POST',
    headers: { 'content-type': type, accept: type, ...headers },
    body: encodeWire(value, type),
  });
  return {
    status: response.status,
    value: decodeWire(
      await response.arrayBuffer(),
      response.headers.get('content-type')
    ),
  };
};

for (const type of [LINO_TEXT, LINO_BINARY]) {
  test(
    `vacancy routes preserve shared collection and search options over ${type}`,
    { timeout: 10000 },
    async () => {
      await withRoutes(async (base, calls) => {
        const search = await wirePost(
          base,
          'search',
          { resume: 'selected', page: 1, remote: true },
          type
        );
        assert.equal(search.status, 200);
        assert.match(calls[0], /resume=selected/u);
        assert.match(calls[0], /page=1/u);
        const collected = await wirePost(
          base,
          'collect',
          { url: vacancyUrl },
          type
        );
        assert.equal(collected.value.salary, vacancySnapshotFixture().salary);
        await wirePost(base, 'collect', { url: vacancyUrl }, type);
        assert.equal(calls.filter((call) => call === 'collect').length, 1);
        const bad = await wirePost(base, 'search', { page: '1' }, type);
        assert.equal(bad.status, 400);
        const forbidden = await wirePost(base, 'search', {}, type, {
          origin: 'https://foreign.test',
        });
        assert.equal(forbidden.status, 403);
        assert.equal(calls.length, 2);
        assert.equal(
          (await wirePost(base, 'cancel', {}, type)).value.stopped,
          true
        );
        const resumes = await wirePost(
          base,
          'resumes',
          { resumeLanguage: 'any' },
          type
        );
        assert.equal(resumes.value.selection.hash, 'english');
        const cached = await fetch(`${base}/api/vacancies/resumes-stored`, {
          headers: { accept: type },
        });
        const saved = decodeWire(
          await cached.arrayBuffer(),
          cached.headers.get('content-type')
        );
        assert.equal(saved.lists[0].entries.length, 3);
        assert.equal(calls.length, 3);
      });
    }
  );
}

test('CLI keeps Lino output, exact filters and browser lifetime in both operations', async () => {
  const store = createMemoryStore();
  let closed = 0;
  store.close = async () => {
    closed++;
  };
  const reads = [];
  const commands = createVacancyCommands({
    openStore: async () => store,
    readSearch: async (url, options) => {
      reads.push({ url, options });
      return searchFixture(url);
    },
    readVacancy: async (_url, options) => {
      reads.push(options);
      return vacancySnapshotFixture();
    },
    readResumes: async (options) => {
      reads.push(options);
      return resumeListFixture(options.browserSlot);
    },
  });
  const output = [];
  assert.equal(
    await commands['vacancies-search'](
      {
        query: 'Python',
        resume: 'selected',
        remote: 'false',
        page: '2',
        'browser-slot': 'second',
        headless: 'false',
      },
      (value) => output.push(decodeWire(value))
    ),
    0
  );
  assert.equal(output[0].cards[0].title, 'Python engineer');
  assert.equal(new URL(reads[0].url).searchParams.get('resume'), 'selected');
  assert.equal(new URL(reads[0].url).searchParams.has('work_format'), false);
  assert.equal(reads[0].options.headless, false);
  assert.equal(reads[0].options.browserSlot, 'second');
  await commands['vacancies-collect']({ url: vacancyUrl }, (value) =>
    output.push(decodeWire(value))
  );
  assert.equal(output[1].description, vacancySnapshotFixture().description);
  assert.equal(closed, 2);
  await assert.rejects(
    commands['vacancies-search']({ remote: 'yes' }, () => {}),
    /boolean/u
  );
  assert.equal(closed, 2, 'invalid flags fail before opening storage');
  await commands['vacancies-resumes'](
    { 'resume-language': 'any', 'browser-slot': 'personal' },
    (value) => output.push(decodeWire(value))
  );
  assert.equal(output[2].selection.hash, 'english');
  assert.equal(output[2].browserSlot, 'personal');
  assert.equal(closed, 3);
});

test('vacancy API preserves offline cached descriptions and refused reads', async () => {
  const store = createMemoryStore();
  await store.put({
    ...vacancySnapshotFixture(),
    id: 'assignment-vacancy:fixture',
  });
  const api = createVacancyApi({
    get: async () => null,
    report: async () => ({ ok: false, code: 'jobs-busy' }),
    local: async () => store,
  });
  assert.equal((await api.vacancyCapabilities()).search, false);
  assert.equal((await api.vacancyStored()).entries.length, 1);
  assert.deepEqual(await api.vacancySearch({}), {
    ok: false,
    code: 'jobs-busy',
  });
});

test('vacancy API requires exact validated search, collection and Stop receipts', async () => {
  const url = hhSearchUrl({});
  let receipt = validateVacancySearch(searchFixture(url), url);
  const api = createVacancyApi({ report: async () => receipt });
  assert.equal((await api.vacancySearch({})).cards[0].url, vacancyUrl);
  for (const invalid of [
    { ...receipt, url: 'https://hh.ru/account/login' },
    { ...receipt, page: 1 },
    { ...receipt, nextPage: 3 },
    { ...receipt, capturedAt: 'invalid' },
    { ...receipt, cards: [{ ...receipt.cards[0], responded: 'false' }] },
  ]) {
    receipt = invalid;
    await assert.rejects(api.vacancySearch({}));
  }
  receipt = { id: 'assignment-vacancy:fixture', ...vacancySnapshotFixture() };
  assert.equal((await api.vacancyCollect({ url: vacancyUrl })).url, vacancyUrl);
  receipt = { ...receipt, description: '' };
  await assert.rejects(api.vacancyCollect({ url: vacancyUrl }));
  receipt = { ok: true };
  await assert.rejects(api.vacancyCancel(), { code: 'jobs-unconfirmed' });
  receipt = { stopped: true };
  assert.deepEqual(await api.vacancyCancel(), { stopped: true });
});

test('vacancy controls render search, saved prose, exact metadata and offline refusal in four locales', () => {
  const render = screenRenderer(VacanciesScreen);
  const selected = {
    ...vacancySnapshotFixture(),
    id: 'assignment-vacancy:fixture',
  };
  const state = {
    values: {
      query: '',
      resume: 'selected',
      area: '',
      salary: '',
      currency: 'RUR',
      order: 'salary_desc',
      remote: false,
      browserSlot: 'jobs',
      mode: 'inherit',
      resumeLanguage: 'ru',
    },
    capabilities: { search: false, collect: false },
    stored: [selected],
    result: null,
    selected,
    busy: '',
    error: '',
    loaded: true,
    valid: true,
    browserValid: true,
    resumeLists: [resumeListFixture()],
    readResumes() {},
    selectResume() {},
    search() {},
    cancel() {},
    setValues() {},
    setSelected() {},
  };
  for (const locale of ['en', 'ru', 'zh', 'hi']) {
    const html = render(state, locale);
    assert.match(html, /data-vacancies/u);
    assert.match(html, /data-vacancy-action="search"[^>]*disabled/u);
    assert.match(html, /data-vacancy-action="refresh"[^>]*disabled/u);
    assert.ok(html.includes('Employer’s final paragraph stays intact.'));
    assert.ok(html.includes('от 250 000 ₽'));
    assert.doesNotMatch(html, />vacancy\./u);
    assert.match(html, /data-vacancy-resume="russian-new"/u);
    assert.match(html, /data-vacancy-action="resumes"[^>]*disabled/u);
  }
});
