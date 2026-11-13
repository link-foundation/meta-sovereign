import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { createMemoryStore } from '../src/storage/universal.js';
import { createVacancyService } from '../src/jobs/service.js';
import { createVacancyCommands } from '../src/cli/vacancy-commands.js';
import { createVacancyApi } from '../src/web/vacancy-api.js';
import {
  vacancySelectionOptions,
  vacancySelectionResult,
} from '../src/jobs/vacancy-selection.js';
import { validateVacancySearch } from '../src/jobs/search-result.js';
import { vacancyChoiceId } from '../src/jobs/vacancy-choice.js';
import { hhSearchUrl } from '../src/jobs/options.js';
import { withRoutes, wirePost } from './helpers/vacancy-routes.mjs';
import { LINO_TEXT, LINO_BINARY, decodeWire } from '../src/transport/lino.js';
import {
  vacancySnapshotFixture,
  searchFixture,
} from '../../experiments/issue-56/vacancy-fixture.mjs';
import {
  VacancySelectionSettings,
  VacancySelectionStatus,
  VacancySelectionSummary,
  selectionIsCurrent,
} from '../src/web/vacancy-selection.js';
import { renderInLocale } from './util-render.js';
import { translate } from '../src/web/i18n.js';

const card = (id, more = {}) => ({
  ...vacancySnapshotFixture(),
  url: `https://hh.ru/vacancy/${id}`,
  responded: false,
  ...more,
});
const make = (cards = [card(123)]) => {
  const store = createMemoryStore();
  let reads = 0;
  const service = createVacancyService({
    store,
    readSearch: async (url) => {
      reads++;
      return validateVacancySearch(searchFixture(url, cards), url);
    },
    readVacancy: async (url) => ({ ...vacancySnapshotFixture(), url }),
    openSession: async () =>
      assert.fail('The reader seam owns provider access'),
  });
  return { store, service, reads: () => reads };
};
const reasons = (result) => result.selection.decisions.map((row) => row.reason);

test(
  'selection honors private choices, native response and cached prose without hiding cards or writing state',
  { timeout: 3000 },
  async () => {
    const cards = [
      card(1, { responded: true }),
      card(2),
      card(3),
      card(4, { title: 'Circuit designer' }),
      card(5),
      card(6),
    ];
    const { store, service, reads } = make(cards);
    try {
      const saved = await service['choice-save']({
        ...cards[1],
        state: 'skipped',
        note: 'Private owner context',
        revision: 'empty',
      });
      await service['choice-save']({
        ...cards[2],
        state: 'deferred',
        note: 'Private question',
        revision: saved.revision,
      });
      await service.collect({ url: cards[4].url });
      const before = await store.query();
      const result = await service.search({
        excludeText: 'circuit\nfinal paragraph',
      });
      assert.deepEqual(
        result.cards.map((row) => row.url),
        cards.map((row) => row.url)
      );
      assert.deepEqual(reasons(result), [
        'responded',
        'owner-skipped',
        'owner-deferred',
        'configured-text',
        'configured-text',
        'needs-description',
      ]);
      const description = result.selection.decisions[4];
      assert.equal(description.field, 'description');
      assert.equal(description.term, 'final paragraph');
      assert.equal(
        description.descriptionCapturedAt,
        vacancySnapshotFixture().capturedAt
      );
      assert.doesNotMatch(
        JSON.stringify(result.selection),
        /Private (owner context|question)/u
      );
      assert.deepEqual(await store.query(), before);
      assert.equal(reads(), 1);
      assert.equal(result.nextPage, null);
    } finally {
      await service.stop();
    }
  }
);

test(
  'literal filters fold Unicode and ё without regex interpretation; absent descriptions stay undecided',
  { timeout: 3000 },
  async () => {
    const { service } = make([
      card(1, { title: 'Ёлка Ｃ＋＋' }),
      card(2, { company: '[a-z]+ Ltd' }),
      card(3),
      card(4, { responded: true }),
    ]);
    try {
      assert.deepEqual(
        reasons(await service.search({ excludeText: 'елка c++\n[a-z]+' })),
        ['configured-text', 'configured-text', 'needs-description', 'responded']
      );
      assert.deepEqual(
        reasons(
          await service.search({ excludeText: '.*', skipResponded: false })
        ),
        Array(4).fill('needs-description')
      );
      assert.deepEqual(
        reasons(await service.search({ skipResponded: false })),
        Array(4).fill('review')
      );
    } finally {
      await service.stop();
    }
  }
);

test(
  'selection binds named slots and uses a new owner revision after explicit restore',
  { timeout: 3000 },
  async () => {
    const { service } = make();
    try {
      const saved = await service['choice-save']({
        ...card(123),
        state: 'skipped',
        revision: 'empty',
      });
      assert.deepEqual(reasons(await service.search({})), ['owner-skipped']);
      assert.deepEqual(
        reasons(await service.search({ browserSlot: 'other' })),
        ['review']
      );
      const cleared = await service['choice-clear']({
        ...card(123),
        revision: saved.revision,
      });
      const next = await service.search({});
      assert.deepEqual(reasons(next), ['review']);
      assert.equal(next.selection.choiceRevision, cleared.revision);
    } finally {
      await service.stop();
    }
  }
);

test('invalid selection preferences fail before the browser opens', async () => {
  const { service, reads, store } = make();
  try {
    for (const input of [
      { skipResponded: 'false' },
      { excludeText: [] },
      { excludeText: 'x'.repeat(121) },
      {
        excludeText: Array.from({ length: 33 }, (_, n) => `term${n}`).join(
          '\n'
        ),
      },
      { excludeText: 'bad\u0000' },
      { excludeText: 'x'.repeat(4001) },
    ]) {
      assert.throws(() => service.search(input));
    }
    assert.equal(reads(), 0);
    assert.deepEqual(await store.query(), []);
    assert.deepEqual(
      vacancySelectionOptions({ excludeText: '  one  \n\none\n two ' })
        .excludeText,
      ['one', 'two']
    );
  } finally {
    await service.stop();
  }
});

test('a corrupt private choice prevents an unqualified new search report', async () => {
  const { service, store } = make();
  try {
    await store.put({ id: vacancyChoiceId('jobs'), version: 7 });
    await assert.rejects(service.search({}), { code: 'jobs-choice-state' });
  } finally {
    await service.stop();
  }
});

test('client refuses mismatched selection receipts and keeps older search servers explicit', async () => {
  const { service } = make([
    card(1, { responded: true }),
    card(2, { title: 'C++ engineer' }),
  ]);
  try {
    const input = { excludeText: 'C++' };
    const original = await service.search(input);
    let receipt = original;
    const api = createVacancyApi({ report: async () => receipt });
    assert.deepEqual(
      (await api.vacancySearch(input)).selection,
      original.selection
    );
    for (const change of [
      (s) => {
        s.browserSlot = 'foreign';
      },
      (s) => {
        s.choiceRevision = 'bad';
      },
      (s) => {
        s.filters.skipResponded = false;
      },
      (s) => {
        s.decisions.reverse();
      },
      (s) => {
        s.decisions.pop();
      },
      (s) => {
        s.decisions[0].reason = 'review';
      },
      (s) => {
        s.decisions[1].term = 'different';
      },
      (s) => {
        s.decisions[1].field = 'company';
      },
      (s) => {
        s.decisions[1].descriptionCapturedAt = 'bad';
      },
      (s) => {
        s.decisions[0].reason = 'sent';
      },
      (s) => {
        s.decisions[0].reason = 'owner-skipped';
      },
    ]) {
      receipt = globalThis.structuredClone(original);
      change(receipt.selection);
      await assert.rejects(api.vacancySearch(input));
    }
    const { selection, ...legacy } = original;
    receipt = legacy;
    assert.equal((await api.vacancySearch(input)).selection, undefined);
    assert.throws(() =>
      vacancySelectionResult(selection, legacy, { excludeText: 'changed' })
    );
  } finally {
    await service.stop();
  }
});

for (const type of [LINO_TEXT, LINO_BINARY]) {
  test(
    `selection and private choices share the actual ${type} route`,
    { timeout: 5000 },
    async () => {
      await withRoutes(async (base) => {
        const saved = await wirePost(
          base,
          'choice-save',
          { ...card(123), state: 'deferred', revision: 'empty' },
          type
        );
        assert.equal(saved.status, 200);
        const result = await wirePost(
          base,
          'search',
          { excludeText: 'Python', skipResponded: false },
          type
        );
        assert.equal(result.status, 200);
        assert.deepEqual(reasons(result.value), ['owner-deferred']);
        assert.equal(
          result.value.selection.choiceRevision,
          saved.value.revision
        );
        assert.deepEqual(result.value.selection.filters, {
          skipResponded: false,
          excludeText: ['Python'],
        });
      });
    }
  );
}

test('CLI retains typed exclusions in Lino output without adding private terms to the provider URL', async () => {
  const { store } = make();
  let closed = 0,
    providerUrl;
  store.close = async () => {
    closed++;
  };
  const commands = createVacancyCommands({
    openStore: async () => store,
    readSearch: async (url) => {
      providerUrl = url;
      return validateVacancySearch(
        searchFixture(url, [
          card(1, { title: 'C++ engineer', responded: true }),
        ]),
        url
      );
    },
  });
  const output = [];
  await commands['vacancies-search'](
    {
      'skip-responded': 'false',
      'exclude-text': 'C++',
      'browser-slot': 'personal',
    },
    (value) => output.push(decodeWire(value))
  );
  assert.deepEqual(reasons(output[0]), ['configured-text']);
  assert.equal(output[0].selection.browserSlot, 'personal');
  assert.equal(providerUrl, hhSearchUrl({}));
  assert.equal(closed, 1);
  await assert.rejects(
    commands['vacancies-search']({ 'skip-responded': 'yes' }, () => {}),
    /boolean/u
  );
  assert.equal(closed, 1);
});

test('four locales show reversible preferences, each reason and explicit stale selection', async () => {
  const { service } = make([card(1, { title: 'C++ engineer' })]);
  try {
    const values = { browserSlot: 'jobs', excludeText: 'C++' };
    const result = { ...(await service.search(values)), input: values };
    const state = {
      values,
      result,
      choices: { ready: true, snapshot: { revision: 'empty' } },
    };
    for (const locale of ['en', 'ru', 'zh', 'hi']) {
      const t = (key, vars) => translate(locale, key, vars);
      const html = renderInLocale(
        locale,
        React.createElement(
          React.Fragment,
          null,
          React.createElement(VacancySelectionSettings, {
            state,
            t,
            update() {},
          }),
          React.createElement(VacancySelectionSummary, { state, t }),
          React.createElement(VacancySelectionStatus, {
            state,
            card: result.cards[0],
            t,
          })
        )
      );
      assert.match(html, /data-vacancy-field="excludeText"/u);
      assert.match(html, /data-vacancy-selection="configured-text"/u);
      assert.match(html, /data-vacancy-selection-summary="current"/u);
      assert.doesNotMatch(html, />vacancySelection\./u);
    }
    assert.equal(selectionIsCurrent(state), true);
    for (const changed of [
      { ...state, values: { ...values, excludeText: '' } },
      { ...state, values: { ...values, browserSlot: 'other' } },
      { ...state, choices: { ready: false, snapshot: { revision: 'empty' } } },
      {
        ...state,
        choices: {
          ready: true,
          snapshot: { revision: globalThis.crypto.randomUUID() },
        },
      },
    ]) {
      assert.equal(selectionIsCurrent(changed), false);
    }
  } finally {
    await service.stop();
  }
});
