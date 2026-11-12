import test from 'node:test';
import assert from 'node:assert/strict';
import { revealBrowserChatReply } from '../src/sources/browser-chat-reply-view.js';
import { HH_WEB_UI } from '../src/sources/hh-web-ui.js';
import {
  replyViewFixture,
  confirmedReply,
} from '../../experiments/issue-56/reply-view-fixture.mjs';

test('original-chat reveal requires exact outgoing identity and witnessed geometry', () => {
  const env = replyViewFixture();
  assert.equal(env.run('prepare'), 'ready');
  assert.equal(env.run('commit'), 'waiting');
  assert.equal(env.state.reply, undefined);
  assert.equal(env.run('reveal'), 'revealed');
  assert.equal(env.run('commit'), 'revealed');
  assert.equal(env.scrolls(), 1);
  assert.deepEqual(env.state.reply, confirmedReply);
  for (const options of [
    { body: 'Different reply' },
    { outgoing: false },
    { duplicate: true },
  ]) {
    const refused = replyViewFixture(options);
    assert.equal(refused.run('reveal'), 'waiting');
    assert.equal(refused.scrolls(), 0);
    assert.equal(refused.state.reply, undefined);
  }
});

test('saved or current drafts and returning owners prevent original-chat scrolling', () => {
  for (const [options, reason] of [
    [{ originalDraft: 'Unfinished' }, 'owner-draft'],
    [{ draft: 'New owner draft' }, 'owner-draft'],
    [{ focused: true }, 'owner-active'],
    [{ interrupted: true }, 'owner-active'],
    [{ url: 'https://hh.ru/chat/8' }, 'owner-active'],
  ]) {
    const env = replyViewFixture(options);
    assert.equal(env.run('prepare'), reason);
    assert.equal(env.run('reveal'), reason);
    assert.equal(env.scrolls(), 0);
  }
});

const tail = ({ prepare = 'ready', missing = false, owner = false } = {}) => {
  const operations = [];
  const views = [];
  let statuses = 0;
  const options = {
    ui: HH_WEB_UI,
    reply: confirmedReply,
    token: 'inactive',
    waitMs: 50,
    document: {
      async evaluate({ args: [input] }) {
        operations.push(input);
        if (input.operation === 'status') {
          statuses++;
        }
        return {
          state: owner && statuses > 1 ? 'owner-active' : 'ready',
          scrollPending: statuses === 1,
        };
      },
    },
    verify: async () => {},
    view: async (operation) => {
      views.push(operation);
      return {
        state:
          operation === 'prepare' ? prepare : missing ? 'waiting' : 'revealed',
      };
    },
  };
  return { options, operations, views };
};

test('virtualized replies wait for scroll settlement and release without restoring after proof', async () => {
  const env = tail();
  assert.equal(
    await revealBrowserChatReply(env.options, async () => {}),
    'revealed'
  );
  assert.deepEqual(env.views, ['prepare', 'reveal', 'commit']);
  assert.equal(
    env.operations.filter((o) => o.operation === 'status').length,
    3
  );
  assert.deepEqual(env.operations.at(-1).restore, false);
});

test('a missing outgoing bubble has finite work and restores the owned earlier anchor', async () => {
  const env = tail({ missing: true });
  let pauses = 0;
  assert.equal(
    await revealBrowserChatReply(env.options, async () => {
      pauses++;
    }),
    'unavailable'
  );
  assert.ok(pauses > 1 && pauses <= 42);
  assert.equal(env.operations.at(-1).operation, 'release');
  assert.equal(env.operations.at(-1).restore, true);
  assert.equal(env.views.includes('commit'), false);
});

test('draft admission opens no tail and owner return prevents automatic restoration', async () => {
  const draft = tail({ prepare: 'owner-draft' });
  assert.equal(
    await revealBrowserChatReply(draft.options, async () => {}),
    'owner-draft'
  );
  assert.equal(draft.operations.length, 0);
  const owner = tail({ owner: true });
  assert.equal(
    await revealBrowserChatReply(owner.options, async () => {}),
    'owner-active'
  );
  assert.equal(owner.operations.at(-1).restore, false);
  assert.equal(owner.views.includes('commit'), false);
});
