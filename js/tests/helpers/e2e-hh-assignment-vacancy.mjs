import assert from 'node:assert/strict';
import { rememberAssignmentVacancy } from '../../src/assignments/vacancy-association.js';
import { createMemoryStore } from '../../src/storage/universal.js';
import { captureNativeAssignmentChat } from '../../../experiments/issue-56/assignment-native-chat-fixture.mjs';
import { vacancyUrl } from '../../../experiments/issue-56/assignment-vacancy-fixture.mjs';

export const verifyHhAssignmentVacancyCapture = async (browser) => {
  const formUrl = 'https://forms.gle/fixture-native-link?part=1';
  for (const [options, id, expected] of [
    [{}, '101', vacancyUrl],
    [{ nested: true }, '101', vacancyUrl],
    [{ history: true }, '8', vacancyUrl],
    [{ header: 'hidden' }, '101', null],
    [{ header: 'foreign' }, '101', null],
  ]) {
    const store = createMemoryStore();
    const { evidence, before, counters, errors } =
      await captureNativeAssignmentChat(browser, store, formUrl, options);
    const key = `msg:hh:web:7:${id}`;
    assert(evidence.imported > 0);
    if (options.history) {
      assert.equal(evidence.coverage.complete, true);
      assert.equal(evidence.restored, true);
    }
    const message = await store.get(key);
    assert.equal(message.body, 'Application form');
    assert.deepEqual(message.links, [formUrl]);
    const association = await rememberAssignmentVacancy(store, [formUrl]);
    assert.equal(association?.vacancyUrl ?? null, expected);
    assert.equal(association?.sourceMessageId ?? null, expected ? key : null);
    assert.deepEqual(counters, { value: before, clicks: 0, sends: 0 });
    assert.deepEqual(errors, []);
  }
  return { cases: 5, liveProvider: false };
};
