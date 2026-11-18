import test from 'node:test';
import assert from 'node:assert/strict';
import { browserComposerFixture } from '../../experiments/issue-56/browser-composer-draft-fixture.mjs';

for (const source of [
  'vk',
  'telegram',
  'whatsapp',
  'x',
  'facebook',
  'linkedin',
  'upwork',
]) {
  for (const input of ['type', 'fill']) {
    test(
      `${source}/${input} preserves an existing owner draft`,
      { timeout: 5000 },
      async () => {
        const { sender, state, draft } = browserComposerFixture({
          source,
          input,
          initial: 'Owner draft',
        });
        try {
          await assert.rejects(sender.send(draft), {
            code: 'answer-draft-preserved',
            fallback: false,
          });
          assert.equal(state.value, 'Owner draft');
          assert.deepEqual(state.inputs, []);
          assert.deepEqual(state.effects, []);
          assert.ok(
            state.navigations.every(
              (url) => !new URL(url).searchParams.has('text')
            )
          );
        } finally {
          await sender.close();
        }
        assert.equal(state.closed, 1);
      }
    );
  }
}

for (const changeAt of [
  'focus',
  'button',
  'input',
  'button-node',
  'focus-node',
  'fill',
]) {
  test(
    `an owner draft changed during ${changeAt} is retained without sending`,
    { timeout: 5000 },
    async () => {
      const { sender, state, draft } = browserComposerFixture({
        changeAt,
        input: 'fill',
      });
      try {
        await assert.rejects(sender.send(draft), {
          code: 'answer-draft-preserved',
          fallback: false,
        });
        assert.deepEqual(state.effects, []);
        if (!changeAt.endsWith('-node')) {
          assert.equal(state.value, 'Owner replacement');
        }
      } finally {
        await sender.close();
      }
    }
  );
}

test(
  'unreadable browser composer refuses without input or dispatch',
  { timeout: 5000 },
  async () => {
    const { sender, state, draft } = browserComposerFixture({
      unreadable: true,
    });
    try {
      await assert.rejects(sender.send(draft), {
        code: 'composer-unverified',
        fallback: false,
      });
      assert.deepEqual(state.inputs, []);
      assert.deepEqual(state.effects, []);
    } finally {
      await sender.close();
    }
  }
);

for (const input of ['type', 'fill']) {
  test(
    `an empty composer still sends one verified multiline ${input} draft`,
    { timeout: 5000 },
    async () => {
      const { sender, state, draft } = browserComposerFixture({ input });
      try {
        assert.equal((await sender.send(draft)).via, 'browser');
        assert.deepEqual(state.effects, [draft.text]);
      } finally {
        await sender.close();
      }
      assert.equal(state.closed, 1);
    }
  );
}
