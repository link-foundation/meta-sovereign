import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { createMemoryStore } from '../src/storage/universal.js';
import { createVacancyCommands } from '../src/cli/vacancy-commands.js';
import { createVacancyApi } from '../src/web/vacancy-api.js';
import { DeferredQuestions } from '../src/web/deferred-questions.js';
import { selectionIsCurrent } from '../src/web/vacancy-selection.js';
import { renderInLocale } from './util-render.js';
import { translate } from '../src/web/i18n.js';
import { LINO_TEXT, LINO_BINARY, decodeWire } from '../src/transport/lino.js';
import { withRoutes, wirePost } from './helpers/vacancy-routes.mjs';
import { storedDeferredQuestions } from '../src/jobs/deferred-questions.js';

const input = {
  action: 'save',
  question: 'Recent experience',
  mode: 'until-answered',
  revision: 'empty',
};
for (const type of [LINO_TEXT, LINO_BINARY]) {
  test(
    `durable question rules use guarded ${type} reads and revisioned mutations`,
    { timeout: 5000 },
    async () => {
      await withRoutes(async (base, calls) => {
        const url = `${base}/api/vacancies/questions-stored?browserSlot=jobs`;
        const response = await fetch(url, { headers: { accept: type } });
        const empty = decodeWire(
          await response.arrayBuffer(),
          response.headers.get('content-type')
        );
        assert.equal(empty.revision, 'empty');
        assert.equal(
          (
            await wirePost(base, 'question-change', input, type, {
              origin: 'https://foreign.example',
            })
          ).status,
          403
        );
        const saved = await wirePost(base, 'question-change', input, type);
        assert.equal(saved.status, 200);
        assert.equal(saved.value.entries[0].question, input.question);
        assert.equal(
          (await wirePost(base, 'question-change', input, type)).status,
          409
        );
        const removed = await wirePost(
          base,
          'question-change',
          {
            action: 'remove',
            entryId: saved.value.entries[0].id,
            revision: saved.value.revision,
          },
          type
        );
        assert.equal(removed.status, 200);
        assert.deepEqual(removed.value.entries, []);
        assert.deepEqual(calls, []);
      });
    }
  );
}

test(
  'CLI durable-question commands share the private store without opening a browser',
  { timeout: 4000 },
  async () => {
    const memory = createMemoryStore();
    const output = [];
    const commands = createVacancyCommands({
      openStore: async () => ({ ...memory, close: async () => {} }),
      availability: async () => ({ available: true }),
      openSession: () => {
        throw new Error('unexpected browser');
      },
    });
    assert.equal(
      await commands['vacancies-question-change'](
        { ...input, 'browser-slot': 'jobs' },
        (text) => output.push(decodeWire(text))
      ),
      0
    );
    const saved = output.pop();
    assert.equal(saved.entries[0].mode, 'until-answered');
    assert.equal(
      await commands['vacancies-questions-stored']({}, (text) =>
        output.push(decodeWire(text))
      ),
      0
    );
    assert.deepEqual(output.pop(), saved);
    assert.equal(
      await commands['vacancies-question-change'](
        {
          action: 'remove',
          'entry-id': saved.entries[0].id,
          revision: saved.revision,
        },
        (text) => output.push(decodeWire(text))
      ),
      0
    );
    assert.deepEqual(output.pop().entries, []);
    await memory.close?.();
  }
);

test('web API retains read-only offline access and refuses unconfirmed question mutations without retry', async () => {
  const store = createMemoryStore();
  let mutations = 0;
  const empty = await storedDeferredQuestions(store);
  const api = createVacancyApi({
    get: async () => null,
    local: async () => store,
    report: async (_path, body, flags) => {
      mutations++;
      assert.deepEqual(flags, { network: true, read: false });
      return {
        ...empty,
        revision: globalThis.crypto.randomUUID(),
        entries: [
          {
            id: globalThis.crypto.randomUUID(),
            question: body.question,
            mode: 'always',
            vacancies: [],
            createdAt: new Date().toISOString(),
          },
        ],
      };
    },
  });
  assert.deepEqual(await api.vacancyQuestionsStored({}), empty);
  await assert.rejects(api.vacancyQuestionChange(input), {
    code: 'jobs-question-deferral-unconfirmed',
  });
  assert.equal(mutations, 1);
});

test('question policy changes invalidate displayed vacancy selection', () => {
  const state = {
    values: { browserSlot: 'jobs' },
    choices: { ready: true, snapshot: { revision: 'empty' } },
    questions: { ready: true, snapshot: { revision: 'empty' } },
    result: {
      input: { browserSlot: 'jobs' },
      selection: {
        browserSlot: 'jobs',
        choiceRevision: 'empty',
        questionRevision: 'empty',
      },
    },
  };
  assert.equal(selectionIsCurrent(state), true);
  state.questions.ready = false;
  assert.equal(selectionIsCurrent(state), false);
  state.questions.ready = true;
  state.questions.snapshot.revision = globalThis.crypto.randomUUID();
  assert.equal(selectionIsCurrent(state), false);
});

for (const locale of ['en', 'ru', 'hi', 'zh']) {
  test(`question rules render private content safely and disable uncertain writes in ${locale}`, () => {
    const snapshot = {
      entries: [
        {
          id: globalThis.crypto.randomUUID(),
          question: '<script>private owner question</script>',
          mode: 'always',
          vacancies: [],
        },
      ],
    };
    const state = {
      values: { browserSlot: 'jobs' },
      browserValid: true,
      capabilities: { localChoices: true },
      questions: { ready: false, failed: true, snapshot },
    };
    const html = renderInLocale(
      locale,
      React.createElement(DeferredQuestions, {
        state,
        t: (key, variables) => translate(locale, key, variables),
      })
    );
    assert.match(html, /&lt;script&gt;private owner question&lt;\/script&gt;/u);
    assert.match(html, /role="alert"/u);
    assert.doesNotMatch(html, /deferredQuestions\.|<script>/u);
    assert.match(html, /disabled="" data-deferred-question-save/u);
  });
}
