import test from 'node:test';
import assert from 'node:assert/strict';
import { traceCvPublicationFixture } from '../../experiments/issue-56/cv-publication-trace.mjs';

test('publication fixture boundaries are silent by default and expose no private results or errors', async () => {
  const previous = process.env.CI_CV_PUBLICATION_DEBUG;
  const errorLog = console.error;
  const messages = [];
  const privateValue = { path: '/PRIVATE_REPOSITORY', content: 'PRIVATE_CV' };
  const failure = new Error('PRIVATE_GIT_STDERR');
  try {
    console.error = (...args) => messages.push(args);
    delete process.env.CI_CV_PUBLICATION_DEBUG;
    assert.equal(
      await traceCvPublicationFixture('wire-plan', async () => privateValue),
      privateValue
    );
    assert.deepEqual(messages, []);
    process.env.CI_CV_PUBLICATION_DEBUG = '1';
    assert.equal(
      await traceCvPublicationFixture('wire-plan', async () => privateValue),
      privateValue
    );
    await assert.rejects(
      traceCvPublicationFixture('wire-publish', async () => {
        throw failure;
      }),
      (error) => error === failure
    );
    const events = messages.map(([label, raw]) => {
      assert.equal(label, '[cv-publication-fixture]');
      const event = JSON.parse(raw);
      assert.deepEqual(Object.keys(event), [
        'id',
        'phase',
        'state',
        'elapsedMs',
      ]);
      assert.ok(Number.isSafeInteger(event.elapsedMs) && event.elapsedMs >= 0);
      return event;
    });
    assert.deepEqual(
      events.map((event) => event.state),
      ['started', 'completed', 'started', 'failed']
    );
    assert.equal(events[0].id, events[1].id);
    assert.equal(events[2].id, events[3].id);
    assert.notEqual(events[0].id, events[2].id);
    assert.doesNotMatch(JSON.stringify(messages), /PRIVATE/u);
  } finally {
    console.error = errorLog;
    if (previous === undefined) {
      delete process.env.CI_CV_PUBLICATION_DEBUG;
    } else {
      process.env.CI_CV_PUBLICATION_DEBUG = previous;
    }
  }
});
