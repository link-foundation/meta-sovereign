import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mergeConversationWindow,
  scanBrowserConversation,
} from '../src/sources/browser-conversation-history.js';
import { browserChatListState } from '../src/sources/browser-chat-list-state.js';
import { createBrowserSender } from '../src/sources/browser-sender.js';
import { HH_WEB_UI } from '../src/sources/hh-web-ui.js';

const message = (id, extra = {}) => ({
  id,
  body: `Message ${id}`,
  outgoing: false,
  timestamp: null,
  ...extra,
});
const application = message('application', { service: true, body: '' });
const fixture = ({
  pages = [
    [message('z'), message('a')],
    [application, message('z')],
  ],
  loading = false,
  hook,
} = {}) => {
  let tick = 0;
  let page = 0;
  let status = 'ready';
  let reads = 0;
  const releases = [];
  const document = {
    async evaluate({ fn, args: [input] }) {
      if (fn !== browserChatListState) {
        reads++;
        hook?.({
          reads,
          change: (value) => {
            status = value;
          },
        });
        return { chat: '7', messages: pages[page] };
      }
      if (input.operation === 'release') {
        releases.push(input.restore);
        return { restored: input.restore };
      }
      if (status === 'navigated') {
        throw Object.assign(new Error('Changed document'), {
          code: 'answer-chat-unverified',
        });
      }
      if (input.operation === 'move') {
        page = Math.min(page + 1, pages.length - 1);
      }
      return {
        state: status,
        top: -page * 100,
        height: pages.length * 100,
        view: 100,
        reversed: true,
        oldest: page === pages.length - 1,
        loading,
      };
    },
  };
  return {
    document,
    releases,
    reads: () => reads,
    dependencies: {
      now: () => tick,
      pause: async (ms) => {
        tick += ms;
      },
    },
  };
};
const run = (value, options = {}, dependencies = {}) =>
  scanBrowserConversation(
    value.document,
    HH_WEB_UI,
    '7',
    { waitMs: 10, endWaitMs: 100, ...options },
    { ...value.dependencies, ...dependencies }
  );

test('conversation traversal preserves overlap chronology without interpreting IDs', async () => {
  const value = fixture();
  const result = await run(value);
  assert.deepEqual(result.rows, [application, message('z'), message('a')]);
  assert.deepEqual(result.coverage, {
    complete: true,
    scope: 'conversation',
    reason: 'provider-start',
    passes: 2,
  });
  assert.equal(result.restored, true);
  assert.deepEqual(value.releases, [true]);
});

test('stalled history without an application stays incomplete, including an empty chat', async () => {
  for (const pages of [[[message('old')], [message('old')]], [[]]]) {
    const result = await run(fixture({ pages }));
    assert.equal(result.coverage.complete, false);
    assert.equal(result.coverage.reason, 'rendered-start');
  }
});

test('mounted-tail option metadata is excluded from stable transcript rows', async () => {
  const result = await run(
    fixture({
      pages: [
        [
          message('z'),
          message('a', { strictOptions: true, answerOptions: ['Yes', 'No'] }),
        ],
        [
          application,
          message('z', { strictOptions: false, answerOptions: [] }),
        ],
      ],
    })
  );
  assert.equal(result.coverage.complete, true);
  assert.deepEqual(result.rows, [application, message('z'), message('a')]);
});

test('gaps, changed messages, reordering and new replies never prove complete history', () => {
  const known = [message('b'), message('c')];
  const invalid = [
    [[application], 'history-gap'],
    [[application, message('c')], 'history-gap'],
    [[message('b', { body: 'Edited' })], 'conversation-changed'],
    [[message('c'), message('b')], 'conversation-changed'],
    [[message('b'), message('c'), message('new')], 'conversation-changed'],
  ];
  for (const [incoming, historyReason] of invalid) {
    assert.throws(() => mergeConversationWindow(known, incoming), {
      historyReason,
    });
    assert.deepEqual(known, [message('b'), message('c')]);
  }
});

test('owner input and navigation after a read stop before accepting that window or restoring', async () => {
  for (const status of ['owner-active', 'navigated']) {
    const value = fixture({ hook: ({ change }) => change(status) });
    const result = await run(value);
    assert.equal(
      result.coverage.reason,
      status === 'navigated' ? 'document-changed' : status
    );
    assert.deepEqual(result.rows, []);
    assert.deepEqual(value.releases, [false]);
  }
});

test('message, byte, pass, time and loading limits retain incomplete coverage', async () => {
  for (const [options, setup, reason] of [
    [{ limit: 1 }, {}, 'history-limit'],
    [{ maxPasses: 1 }, {}, 'pass-limit'],
    [{ budgetMs: 100, waitMs: 100 }, {}, 'time-limit'],
    [{ maxPasses: 2 }, { loading: true }, 'pass-limit'],
    [
      { limit: 5000 },
      {
        pages: [
          Array.from({ length: 170 }, (_, i) =>
            message(String(i), { body: 'a'.repeat(6000) })
          ),
        ],
      },
      'history-limit',
    ],
  ]) {
    const value = fixture(setup);
    const result = await run(value, options);
    assert.equal(result.coverage.complete, false);
    assert.equal(result.coverage.reason, reason);
    assert.equal(result.restored, true);
  }
});

test('cancellation during settling performs no subsequent history read', async () => {
  const controller = new AbortController();
  const value = fixture();
  const result = await run(
    value,
    { signal: controller.signal },
    { pause: async () => controller.abort() }
  );
  assert.equal(result.coverage.reason, 'cancelled');
  assert.equal(value.reads(), 0);
  assert.equal(result.restored, true);
});

test('public conversation scanner validates bounds and capability without launching', async () => {
  let launches = 0;
  const sender = createBrowserSender({
    openSession: () => {
      launches++;
      throw new Error('Unexpected launch');
    },
  });
  try {
    assert.equal(typeof sender.scanConversation, 'function');
    await assert.rejects(sender.scanConversation({ source: 'vk', chat: '7' }), {
      code: 'unsupported-action',
    });
    for (const limit of [0, 5001, '3', NaN]) {
      await assert.rejects(
        sender.scanConversation({ source: 'hh', chat: '7', limit }),
        { code: 'bad-chat-scan' }
      );
    }
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
      sender.scanConversation({
        source: 'hh',
        chat: '7',
        signal: controller.signal,
      }),
      { code: 'cancelled' }
    );
    assert.equal(launches, 0);
  } finally {
    await sender.close();
  }
  await assert.rejects(sender.scanConversation({ source: 'hh', chat: '7' }), {
    code: 'browser-closed',
  });
});
