import test from 'node:test';
import assert from 'node:assert/strict';
import { withBrowserConversationTail } from '../src/sources/browser-conversation-tail.js';
import { browserChatListState } from '../src/sources/browser-chat-list-state.js';
import { HH_WEB_UI } from '../src/sources/hh-web-ui.js';
import { textReplyExpected } from '../../experiments/issue-56/text-reply-fixture.mjs';
import { releaseBrowserConversation } from '../src/sources/browser-conversation-history.js';

const fixture = ({ loading = false, changed = false } = {}) => {
  const events = [];
  const controller = new AbortController();
  let reads = 0;
  let paused = false;
  let unblock;
  const gate = new Promise((resolve) => {
    unblock = resolve;
  });
  const document = {
    async evaluate({ fn, args: [input] }) {
      events.push(input.operation);
      if (fn === browserChatListState) {
        assert.equal(input.allowOwnedInput, true);
        return { state: 'ready', loading, restored: !paused };
      }
      if (input.operation === 'read') {
        reads++;
        return {
          ...textReplyExpected(),
          ...(changed
            ? {
                question: {
                  ...textReplyExpected().question,
                  body: `Changed ${reads}`,
                },
              }
            : {}),
        };
      }
      if (input.operation === 'armText') {
        return { armed: true, selector: 'button' };
      }
      if (input.operation === 'receipt') {
        if (paused) {
          await gate;
        }
        return { sent: true, messageId: '102' };
      }
      assert.equal(input.operation, 'release');
      return {};
    },
    async clickButton(input) {
      assert.equal(input.inactiveToken, 'borrowed');
      events.push('click');
    },
  };
  return {
    events,
    controller,
    unblock,
    holdReceipt() {
      paused = true;
    },
    options: {
      document,
      ui: HH_WEB_UI,
      chat: '7',
      token: 'borrowed',
      signal: controller.signal,
      settings: { maxPasses: 4, waitMs: 1, budgetMs: 1000 },
      verify: async () => {},
    },
  };
};
const visit = (env, work) =>
  withBrowserConversationTail(env.options, work, {
    pause: async () => {},
    now: () => 0,
  });

test('borrowed tail waits for a stable latest snapshot and expires after its callback', async () => {
  const env = fixture();
  let saved;
  const result = await visit(env, async (handle) => {
    saved = handle;
    assert.equal(env.events.filter((event) => event === 'read').length, 2);
    assert.deepEqual(await handle.readInactiveQuestion(), handle.snapshot);
    return { reviewed: true };
  });
  assert.deepEqual(result, { value: { reviewed: true }, restored: true });
  assert.ok(env.events.indexOf('restore') > env.events.indexOf('read'));
  const previous = env.events.length;
  await assert.rejects(saved.readInactiveQuestion(), {
    code: 'browser-unread-visit-closed',
  });
  await assert.rejects(saved.replyTextInactive(saved.snapshot, 'Thanks'), {
    code: 'browser-unread-visit-closed',
  });
  assert.equal(env.events.length, previous);
});

test('unstable or loading tails are bounded and never invoke the visitor', async () => {
  for (const input of [{ loading: true }, { changed: true }]) {
    const env = fixture(input);
    await assert.rejects(
      visit(env, () => assert.fail('Unstable tail admitted')),
      { code: 'browser-unread-tail-unstable' }
    );
    assert.equal(env.events.at(-1), 'release');
    assert.equal(env.events.includes('click'), false);
  }
});

test('cancellation before dispatch refuses the effect and still restores the owned reading position', async () => {
  const env = fixture();
  await visit(env, async (handle) => {
    env.controller.abort();
    await assert.rejects(handle.replyTextInactive(handle.snapshot, 'Thanks'), {
      code: 'browser-unread-cancelled',
    });
  });
  assert.equal(env.events.includes('click'), false);
  assert.equal(env.events.at(-1), 'release');
});

test(
  'the visit drains an issued reply before restoration and retains its positive receipt',
  { timeout: 5000 },
  async () => {
    const env = fixture();
    let receipt;
    let issued;
    const clicked = new Promise((resolve) => {
      issued = resolve;
    });
    const click = env.options.document.clickButton;
    env.options.document.clickButton = async (input) => {
      await click(input);
      issued();
    };
    const work = visit(env, async (handle) => {
      env.holdReceipt();
      const pending = handle.replyTextInactive(handle.snapshot, 'Thanks');
      await clicked;
      pending.then((value) => {
        receipt = value;
      });
      // Deliberately return with a reply in flight. The visit must drain it.
    });
    await clicked;
    await Promise.resolve();
    assert.equal(env.events.includes('restore'), false);
    env.unblock();
    const result = await work;
    assert.equal(receipt.messageId, '102');
    assert.equal(receipt.text, 'Thanks');
    assert.equal(result.restored, false);
    assert.ok(env.events.indexOf('restore') > env.events.indexOf('receipt'));
  }
);

test('restoration waits for deferred scroll settlement and yields to owner activity', async () => {
  for (const ownerReturns of [false, true]) {
    let reads = 0;
    let pauses = 0;
    let released;
    const control = async (operation, input) => {
      if (operation === 'release') {
        released = input.restore;
        return { restored: input.restore };
      }
      if (operation === 'status') {
        reads++;
      }
      return {
        state: ownerReturns && reads >= 3 ? 'owner-active' : 'ready',
        scrollPending: reads > 1 && reads < 4,
      };
    };
    assert.equal(
      await releaseBrowserConversation(
        control,
        async () => {
          pauses++;
        },
        100
      ),
      !ownerReturns
    );
    assert.equal(released, !ownerReturns);
    assert.ok(pauses >= 2 && pauses <= 3);
  }
});
