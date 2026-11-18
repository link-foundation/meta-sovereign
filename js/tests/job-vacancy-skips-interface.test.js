import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { createMemoryStore } from '../src/storage/universal.js';
import { vacancySkipId } from '../src/jobs/vacancy-skip-data.js';
import { skipSnapshot } from '../../experiments/issue-56/vacancy-skip-fixture.mjs';
import { withRoutes, wirePost } from './helpers/vacancy-routes.mjs';
import { LINO_TEXT, LINO_BINARY, decodeWire } from '../src/transport/lino.js';
import { createVacancyCommands } from '../src/cli/vacancy-commands.js';
import { createVacancyApi } from '../src/web/vacancy-api.js';
import { VacancySkips } from '../src/web/vacancy-skips.js';
import { renderInLocale } from './util-render.js';
import { translate } from '../src/web/i18n.js';
import { spawnSync } from 'node:child_process';
import { vacancySkipPrefillCommand } from '../src/jobs/vacancy-skip-command.js';
import { selectionIsCurrent } from '../src/web/vacancy-selection.js';
import { transientVacancySkipReasons } from '../src/jobs/vacancy-skip-policy.js';

const transientSnapshot = () => {
  const base = skipSnapshot();
  return skipSnapshot({
    entries: transientVacancySkipReasons.map((reason, index) => ({
      ...base.entries[0],
      url: `https://hh.ru/vacancy/${123 + index}`,
      externalUrl: null,
      reason,
      runId: 'run-earlier',
      attempts: (index % 2) + 1,
    })),
  });
};

for (const type of [LINO_TEXT, LINO_BINARY]) {
  test(
    `transient retry counts and run identity survive ${type} listing and reason clears`,
    { timeout: 5000 },
    async () => {
      const store = createMemoryStore();
      const snapshot = transientSnapshot();
      await store.put({ id: vacancySkipId('jobs'), ...snapshot });
      try {
        await withRoutes(
          async (base) => {
            const response = await fetch(`${base}/api/vacancies/skips-stored`, {
              headers: { accept: type },
            });
            assert.equal(response.status, 200);
            const restored = decodeWire(
              await response.arrayBuffer(),
              response.headers.get('content-type')
            );
            assert.deepEqual(restored, snapshot);
            const cleared = await wirePost(
              base,
              'skip-clear',
              { revision: snapshot.revision, reason: 'apply_button_disabled' },
              type
            );
            assert.equal(cleared.status, 200);
            assert.deepEqual(cleared.value.entries, snapshot.entries.slice(1));
          },
          { store }
        );
      } finally {
        await store.close?.();
      }
    }
  );
}

test('CLI preserves transient retry metadata and clears only the selected reason', async () => {
  const store = createMemoryStore();
  const snapshot = transientSnapshot();
  await store.put({ id: vacancySkipId('jobs'), ...snapshot });
  const commands = createVacancyCommands({ openStore: async () => store });
  const output = [];
  const log = (value) => output.push(decodeWire(value));
  assert.equal(await commands['vacancies-skips-stored']({}, log), 0);
  assert.deepEqual(output[0], snapshot);
  assert.equal(
    await commands['vacancies-skip-clear'](
      { revision: snapshot.revision, reason: 'click_failed' },
      log
    ),
    0
  );
  assert.deepEqual(output[1].entries, snapshot.entries.slice(0, 3));
});

test('all transient reasons show translated later-run or exhausted recovery instructions', () => {
  const snapshot = transientSnapshot();
  const state = {
    values: { browserSlot: 'jobs' },
    capabilities: { localChoices: true },
    skips: { ready: true, snapshot, change() {}, reload() {} },
  };
  for (const locale of ['en', 'ru', 'hi', 'zh']) {
    const html = renderInLocale(
      locale,
      React.createElement(VacancySkips, {
        state,
        t: (key, values) => translate(locale, key, values),
      })
    );
    for (const entry of snapshot.entries) {
      assert(html.includes(translate(locale, `vacancySkip.${entry.reason}`)));
    }
    assert.equal(
      (html.match(/data-vacancy-skip-recovery="next-run"/gu) ?? []).length,
      2
    );
    assert.equal(
      (html.match(/data-vacancy-skip-recovery="retry-exhausted"/gu) ?? [])
        .length,
      2
    );
    assert.doesNotMatch(html, /vacancySkip\.[a-z]/u);
  }
});

test('employer prefill commands preserve one quoted URL and use a separate named browser', () => {
  const entry = skipSnapshot().entries[0];
  const url = "https://employer.example/apply'$(printf+unsafe)'?ref=owner";
  const command = vacancySkipPrefillCommand({ ...entry, externalUrl: url });
  if (process.platform !== 'win32') {
    const result = spawnSync(
      '/bin/sh',
      ['-c', `set -- ${command}; printf '%s\\n' "$@"`],
      { encoding: 'utf8' }
    );
    assert.equal(result.status, 0);
    assert.deepEqual(result.stdout.trim().split('\n'), [
      'meta-sovereign',
      'forms-review',
      '--prefill',
      `--url=${url}`,
      '--browser-slot=hh-external-123',
    ]);
  }
  assert.equal(
    vacancySkipPrefillCommand({ ...entry, externalUrl: null }),
    null
  );
  assert.equal(
    vacancySkipPrefillCommand({ ...entry, reason: 'resume_not_visible' }),
    null
  );
});

test('search decisions become stale after refusal records change or cannot be confirmed', () => {
  const snapshot = skipSnapshot();
  const state = {
    values: { browserSlot: 'jobs' },
    choices: { ready: true, snapshot: { revision: 'empty' } },
    skips: { ready: true, snapshot },
    result: {
      input: { browserSlot: 'jobs' },
      selection: {
        browserSlot: 'jobs',
        choiceRevision: 'empty',
        skipRevision: snapshot.revision,
      },
    },
  };
  assert.equal(selectionIsCurrent(state), true);
  state.skips.ready = false;
  assert.equal(selectionIsCurrent(state), false);
  state.skips.ready = true;
  state.skips.snapshot = {
    ...snapshot,
    revision: globalThis.crypto.randomUUID(),
  };
  assert.equal(selectionIsCurrent(state), false);
});

for (const type of [LINO_TEXT, LINO_BINARY]) {
  test(
    `native skip listing and revisioned clears use guarded shared ${type} routes`,
    { timeout: 5000 },
    async () => {
      const store = createMemoryStore();
      const snapshot = skipSnapshot();
      await store.put({ id: vacancySkipId('jobs'), ...snapshot });
      try {
        await withRoutes(
          async (base, calls) => {
            const response = await fetch(
              `${base}/api/vacancies/skips-stored?browserSlot=jobs`,
              { headers: { accept: type } }
            );
            assert.equal(response.status, 200);
            assert.deepEqual(
              decodeWire(
                await response.arrayBuffer(),
                response.headers.get('content-type')
              ),
              snapshot
            );
            const input = {
              revision: snapshot.revision,
              reason: 'external_site',
            };
            assert.equal(
              (
                await wirePost(base, 'skip-clear', input, type, {
                  origin: 'https://foreign.example',
                })
              ).status,
              403
            );
            assert.equal(
              (
                await wirePost(
                  base,
                  'skip-clear',
                  { ...input, revision: 'empty' },
                  type
                )
              ).status,
              409
            );
            const cleared = await wirePost(base, 'skip-clear', input, type);
            assert.equal(cleared.status, 200);
            assert.deepEqual(cleared.value.entries, []);
            assert.notEqual(cleared.value.revision, snapshot.revision);
            assert.equal(
              (await wirePost(base, 'skip-clear', input, type)).status,
              409
            );
            assert.deepEqual(calls, []);
          },
          { store }
        );
      } finally {
        await store.close?.();
      }
    }
  );
}

test('CLI lists and clears durable refusal records without a browser', async () => {
  const store = createMemoryStore();
  const snapshot = skipSnapshot();
  await store.put({ id: vacancySkipId('jobs'), ...snapshot });
  const commands = createVacancyCommands({ openStore: async () => store });
  const output = [];
  const log = (value) => output.push(decodeWire(value));
  assert.equal(await commands['vacancies-skips-stored']({}, log), 0);
  assert.deepEqual(output[0], snapshot);
  assert.equal(
    await commands['vacancies-skip-clear'](
      { revision: snapshot.revision, url: snapshot.entries[0].url },
      log
    ),
    0
  );
  assert.deepEqual(output[1].entries, []);
});

test('web API allows private offline reads and refuses unchanged, malformed, foreign or uncertain clear receipts', async () => {
  const store = createMemoryStore();
  const snapshot = skipSnapshot();
  await store.put({ id: vacancySkipId('jobs'), ...snapshot });
  let answer = snapshot;
  const api = createVacancyApi({
    get: async () => null,
    report: async (_path, _input, options) => {
      assert.deepEqual(options, { network: true, read: false });
      if (answer instanceof Error) {
        throw answer;
      }
      return answer;
    },
    local: async () => store,
  });
  try {
    assert.deepEqual(await api.vacancySkipsStored({}), snapshot);
    const input = { revision: snapshot.revision, reason: 'external_site' };
    for (const bad of [
      snapshot,
      { ok: true },
      { ...snapshot, browserSlot: 'foreign' },
      new Error('lost clear acknowledgement'),
    ]) {
      answer = bad;
      await assert.rejects(api.vacancySkipClear(input));
      assert.deepEqual(await api.vacancySkipsStored({}), snapshot);
    }
    answer = {
      ...snapshot,
      revision: globalThis.crypto.randomUUID(),
      entries: [],
    };
    assert.deepEqual(await api.vacancySkipClear(input), answer);
  } finally {
    await store.close?.();
  }
});

test('durable refusal UI explains recovery and preserves translated, bounded, read-only records', () => {
  const snapshot = skipSnapshot();
  const entry = snapshot.entries[0];
  const state = {
    values: { browserSlot: 'jobs' },
    busy: '',
    browserValid: true,
    capabilities: { localChoices: false },
    skips: {
      ready: true,
      failed: true,
      snapshot: {
        ...snapshot,
        entries: Array.from({ length: 21 }, (_, index) => ({
          ...entry,
          url: `https://hh.ru/vacancy/${index + 1}`,
        })),
      },
      change() {},
      reload() {},
    },
  };
  for (const locale of ['en', 'ru', 'hi', 'zh']) {
    const html = renderInLocale(
      locale,
      React.createElement(VacancySkips, {
        state,
        t: (key, values) => translate(locale, key, values),
      })
    );
    assert.equal((html.match(/data-vacancy-skip="/gu) ?? []).length, 20);
    assert.match(html, /data-vacancy-skip-action="more"/u);
    assert.match(html, /role="alert"/u);
    assert.match(
      html,
      /disabled=""[^>]*data-vacancy-skip-action="clear-external_site"/u
    );
    assert.match(html, /https:\/\/employer.example\/apply/u);
    assert.doesNotMatch(html, />vacancySkip\./u);
  }
});
