import test from 'node:test';
import assert from 'node:assert/strict';
import { browserWatchDispatchFixture } from '../../experiments/issue-56/browser-watch-dispatch-fixture.mjs';
import { questionWatchGate } from '../../experiments/issue-56/question-watch-fixture.mjs';

for (const mode of ['choice', 'text']) {
  for (const change of ['policy', 'navigation', 'close']) {
    test(
      `watched ${mode} refuses ${change} during arming before native dispatch`,
      { timeout: 5000 },
      async () => {
        const armed = questionWatchGate();
        const resume = questionWatchGate();
        const env = await browserWatchDispatchFixture(mode, {
          arming: async ({ state, page }) => {
            if (change === 'policy') {
              state.active = false;
            } else if (change === 'navigation') {
              page.emit('framenavigated');
            }
            armed.release();
            await resume.promise;
          },
        });
        const issuing = env.issue();
        let closing;
        try {
          await armed.promise;
          if (change === 'close') {
            closing = env.watch.close();
          }
          resume.release();
          await assert.rejects(issuing, {
            code:
              change === 'policy'
                ? 'question-watch-plan-changed'
                : 'question-watch-page-changed',
          });
          assert.equal(env.state.clicks, 0);
          assert.deepEqual(env.state.operations, [
            mode === 'choice' ? 'arm' : 'armText',
            'release',
          ]);
        } finally {
          resume.release();
          await Promise.allSettled([issuing]);
          await closing;
          await env.watch.close();
          assert.equal(env.state.releases, 1);
          assert.equal(env.page.eventNames().length, 0);
        }
      }
    );
  }

  test(
    `watched ${mode} drains an issued reply and retains its positive receipt on Stop`,
    { timeout: 5000 },
    async () => {
      const issued = questionWatchGate();
      const receipt = questionWatchGate();
      const env = await browserWatchDispatchFixture(mode, {
        clicking: () => issued.release(),
        receipt: () => receipt.promise,
      });
      const issuing = env.issue();
      let closing;
      try {
        await issued.promise;
        let closed = false;
        closing = env.watch.close().then(() => {
          closed = true;
        });
        await Promise.resolve();
        assert.equal(closed, false);
        receipt.release();
        const result = await issuing;
        await closing;
        assert.equal(result.messageId, '102');
        assert.equal(result.source, 'hh');
        assert.equal(result.chat, '7');
        assert.equal(env.state.clicks, 1);
        assert.equal(env.state.releases, 1);
        assert.equal(env.state.operations.at(-1), 'release');
      } finally {
        receipt.release();
        await Promise.allSettled([issuing]);
        await closing;
        await env.watch.close();
      }
    }
  );
}
