import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLinoTextStore } from '../src/storage/lino-store.js';
import {
  seedVkGreetings,
  vkGreetingCatalogServer,
  greetingPhrases,
} from '../../experiments/issue-56/vk-greeting-catalog-fixture.mjs';
import {
  planFromStore,
  planGreetings,
  loadGreetingSelection,
  previewGreetings,
  runGreetings,
  defaultGreetingSelection,
  isGreetingMessage,
  knownGreetingStickerIds,
} from '../src/greetings/index.js';
import { createGreetingCommands } from '../src/cli/greetings-commands.js';
import { createGreetingApi } from '../src/web/greetings-api.js';
import { GreetingsScreen } from '../src/web/greetings-view.js';
import { screenRenderer } from './util-render.js';
import { dictionaries } from '../src/web/locales/index.js';
import {
  encodeWire,
  readWireResponse,
  LINO_TEXT,
  LINO_BINARY,
} from '../src/transport/lino.js';

test('VK greeting aggregation respects normalized outgoing and personal destinations', async () => {
  const plan = await planFromStore(await seedVkGreetings(), {
    mode: 'reply',
    random: () => 0,
  });
  assert.deepEqual(
    plan.envelopes
      .filter((e) => !e.skipped)
      .map((e) => e.chat)
      .sort(),
    ['41', '42']
  );
  assert.equal(
    plan.envelopes.find((e) => e.chat === '2000000001').skipped,
    'personal-chat-required'
  );
  assert.equal(
    plan.envelopes.some((e) => e.chat === '43'),
    false
  );
});

test('VK greeting checks cannot be bypassed by summary or direct send plans', async () => {
  const store = await seedVkGreetings();
  const envelopes = ['2000000001', '0', '-2', 'invalid', '1e2', '1.5'].map(
    (chat) => ({ network: 'vk', chat, kind: 'text', text: 'Hi!' })
  );
  const plan = { mode: 'reply', envelopes };
  assert.equal((await previewGreetings(plan, { store })).willSend.length, 0);
  let sends = 0;
  const results = await runGreetings(plan, {
    store,
    resolveSource: () => ({
      live: {
        post: async () => {
          sends++;
          return 9;
        },
      },
    }),
    sleep: async () => {},
  });
  assert.equal(sends, 0);
  assert.ok(results.every((e) => e.skipped === 'personal-chat-required'));
  const summary = {
    network: 'vk',
    chat: '41',
    contact: '41',
    chatType: 'group',
    incoming: 1,
    outgoing: 0,
    last: { body: 'Hi!', timestamp: Date.now() },
    lastOutgoing: false,
  };
  assert.equal(
    planGreetings({ summaries: [summary], mode: 'reply' }).envelopes[0].skipped,
    'personal-chat-required'
  );
});

test('greeting CLI saves literal per-language phrases and retains other catalogs', async () => {
  const store = await seedVkGreetings();
  const cli = createGreetingCommands({ openStore: async () => store });
  const logs = [];
  assert.equal(
    await cli['greetings-select'](
      { language: 'en', texts: greetingPhrases.join('\r\n') },
      (line) => logs.push(line)
    ),
    0
  );
  const selected = await loadGreetingSelection(store);
  assert.deepEqual(selected.texts.en, greetingPhrases);
  assert.deepEqual(selected.texts.ru, defaultGreetingSelection().texts.ru);
  assert.ok(
    logs.some((line) => line.includes(JSON.stringify(greetingPhrases[0])))
  );
  assert.equal(
    (
      await planFromStore(store, { mode: 'reply', random: () => 0 })
    ).envelopes.find((e) => e.chat === '41').text,
    greetingPhrases[0]
  );
});

test('offline greeting catalog save and preview retain literal texts and default reset', async () => {
  const store = await seedVkGreetings();
  const api = createGreetingApi({
    ensure: async () => ({ store }),
    serverFetch: async () => null,
    postJson: async () => null,
    serverPostConfirmed: async () => null,
  });
  await api.saveGreetingSelection({
    prefer: 'text',
    language: 'en',
    texts: { en: greetingPhrases },
  });
  assert.deepEqual((await api.greetingSelection()).texts.en, greetingPhrases);
  assert.ok(
    (await api.greetingPlan({ mode: 'reply' })).envelopes
      .filter((e) => !e.skipped)
      .every((e) => greetingPhrases.includes(e.text))
  );
  await api.saveGreetingSelection({ texts: { en: [' ', ''] } });
  assert.deepEqual(
    (await api.greetingSelection()).texts.en,
    defaultGreetingSelection().texts.en
  );
});

test(
  'default Lino greeting routes preserve catalogs and confirmed actual VK receipts',
  { timeout: 15000 },
  async () => {
    for (const type of [LINO_TEXT, LINO_BINARY]) {
      const fixture = await vkGreetingCatalogServer();
      try {
        const call = async (path, body, method = 'POST') => {
          const response = await fetch(
            `${fixture.base}/api/greetings/${path}`,
            {
              method,
              headers: { accept: type, 'content-type': type },
              body: encodeWire(body, type),
            }
          );
          assert.ok(response.headers.get('content-type').startsWith(type));
          return {
            status: response.status,
            body: await readWireResponse(response),
          };
        };
        const saved = await call(
          'selection',
          {
            language: 'en',
            prefer: 'text',
            texts: { en: [greetingPhrases[0]] },
          },
          'PUT'
        );
        assert.equal(saved.status, 200);
        assert.deepEqual(saved.body.texts.en, [greetingPhrases[0]]);
        const request = {
          mode: 'reply',
          networks: ['vk'],
          run: 'queue',
          limit: 1,
        };
        const pending = await call('plan', request);
        assert.equal(pending.status, 428);
        assert.equal(fixture.vk.calls.length, 0);
        assert.equal(pending.body.preview.dryRun.willSend.length, 1);
        const sent = await call('plan', {
          ...request,
          confirmToken: pending.body.confirm.token,
        });
        assert.equal(sent.status, 200);
        assert.equal(sent.body.results.filter((r) => r.ok).length, 1);
        assert.equal(fixture.vk.calls.length, 1);
        assert.equal(fixture.vk.calls[0].name, 'messages.send');
        assert.ok(['41', '42'].includes(fixture.vk.calls[0].params.peer_id));
        assert.equal(fixture.vk.calls[0].params.message, greetingPhrases[0]);
        assert.equal(sent.body.results.find((r) => r.ok).result, 909);
        assert.equal(
          (await fixture.store.query((l) => l.id.startsWith('greeting:')))
            .length,
          1
        );
        const repeated = await call('plan', {
          mode: 'reply',
          run: 'dry',
          networks: ['vk'],
        });
        assert.ok(
          repeated.body.held.some(
            (e) =>
              e.chat === fixture.vk.calls[0].params.peer_id &&
              e.held === 'greeted-today'
          )
        );
        assert.notEqual(
          (
            await call('plan', {
              ...request,
              confirmToken: pending.body.confirm.token,
            })
          ).status,
          200
        );
        assert.equal(fixture.vk.calls.length, 1);
      } finally {
        await fixture.close();
      }
    }
  }
);

test('whole-text and reference sticker greeting recognition retain daily and opt-out guards', async () => {
  const ids = knownGreetingStickerIds();
  const reference = JSON.parse(
    await readFile(
      new URL(
        '../../experiments/issue-56/vk-greeting-reference-cases.json',
        import.meta.url
      ),
      'utf8'
    )
  );
  for (const id of reference.numericStickerIds) {
    assert.equal(isGreetingMessage({ sticker: { id } }, ids), true, id);
  }
  for (const body of reference.russianForms) {
    assert.equal(isGreetingMessage({ body }, ids), true, body);
  }
  for (const body of [
    'Привет!',
    'Hello!',
    '你好',
    'नमस्ते',
    'Xin chào',
    '👋',
  ]) {
    assert.equal(isGreetingMessage({ body }, ids), true, body);
  }
  for (const body of ['Hello, what is your name?', 'привет, как дела?']) {
    assert.equal(isGreetingMessage({ body }, ids), false, body);
  }
  assert.equal(
    isGreetingMessage({ body: '', sticker: { id: '72789' } }, ids),
    true
  );
  const store = await seedVkGreetings();
  await store.put({
    id: 'automation-settings:global',
    optOut: [{ source: 'vk', chat: '42' }],
  });
  const plan = await planFromStore(store, { mode: 'reply' });
  assert.equal(
    plan.envelopes.find((e) => e.chat === '42').skipped,
    'opted-out'
  );
  await store.put({
    id: 'greeting:vk:41',
    network: 'vk',
    chat: '41',
    sentAt: new Date().toISOString(),
  });
  assert.equal(
    (await previewGreetings(plan, { store })).held.some(
      (e) => e.chat === '41' && e.held === 'greeted-today'
    ),
    true
  );
});

test('all UI locales render a literal editable greeting catalog', () => {
  const selection = {
    ...defaultGreetingSelection(),
    texts: { en: greetingPhrases },
    language: 'en',
  };
  const state = {
    selection,
    catalogue: { networks: {}, stickers: {}, telegram: { sets: [] } },
    busy: '',
    failures: [],
    live: [],
    dirty: false,
    mode: 'reply',
    delaySeconds: 30,
    plan: null,
  };
  for (const locale of Object.keys(dictionaries)) {
    const html = screenRenderer(GreetingsScreen)(state, locale);
    assert.equal(/<textarea[^>]*data-field="texts"/.test(html), true, locale);
    assert.ok(html.includes('Hello &lt;friend&gt; &amp; 👋'));
    assert.ok(html.includes(dictionaries[locale]['greetings.texts']));
  }
});

test('greeting CLI catalogs survive a durable Lino reopen', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vk-greeting-catalog-'));
  try {
    const file = join(dir, 'greetings.lino');
    const store = await createLinoTextStore(file);
    const cli = createGreetingCommands({ openStore: async () => store });
    assert.equal(
      await cli['greetings-select'](
        {
          language: 'ru',
          texts: 'Привет, друг!\nДобрый день!',
          prefer: 'text',
        },
        () => {}
      ),
      0
    );
    const reopened = await createLinoTextStore(file);
    assert.deepEqual((await loadGreetingSelection(reopened)).texts.ru, [
      'Привет, друг!',
      'Добрый день!',
    ]);
    assert.deepEqual(
      (await loadGreetingSelection(reopened)).texts.en,
      defaultGreetingSelection().texts.en
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('VK catalog browser regression is required by the existing greetings CI group', async () => {
  const source = await readFile(
    new URL('./e2e-greetings-browser.mjs', import.meta.url),
    'utf8'
  );
  assert.equal(
    (source.match(/await verifyVkGreetingCatalog\(browser\)/gu) ?? []).length,
    1
  );
  const registry = JSON.parse(
    await readFile(
      new URL('../scripts/browser-checks.json', import.meta.url),
      'utf8'
    )
  );
  assert.equal(registry.filter((name) => name === 'greetings').length, 1);
});
