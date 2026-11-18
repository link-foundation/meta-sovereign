import {
  saveAnswerPolicy,
  readAnswerPolicy,
} from '../../src/automation/question-policy.js';
import { listAnswerRules } from '../../src/automation/question-store.js';
import { assert } from './e2e-chat.mjs';

export const verifyQuestionConcurrency = async ({
  panel,
  store,
  until,
  reading,
}) => {
  const saved = JSON.stringify(await listAnswerRules(store));
  const policy = await readAnswerPolicy(store);
  const release = Promise.withResolvers();
  let held = false;
  reading.beforeGet = async (id) => {
    if (!held && id.startsWith('msg:')) {
      held = true;
      await release.promise;
    }
  };
  try {
    await panel
      .getByRole('button', { name: 'Save proposals for review', exact: true })
      .click();
    await until(() => held, 'learning is reading the archive');
    await saveAnswerPolicy(store, {
      ...policy,
      rejected: [...policy.rejected, 'Concurrent edit fixture'],
    });
    release.resolve();
    await panel
      .getByRole('alert')
      .filter({ hasText: 'knowledge changed during learning' })
      .waitFor();
    assert(
      JSON.stringify(await listAnswerRules(store)) === saved,
      'a stale UI apply preserves every saved rule'
    );
  } finally {
    release.resolve();
    reading.beforeGet = null;
  }
  await panel
    .getByRole('button', { name: 'Save proposals for review', exact: true })
    .click();
  await until(
    async () =>
      (await panel.getByRole('alert').count()) === 0 &&
      (await panel
        .getByRole('button', { name: 'Save proposals for review', exact: true })
        .count()) === 0,
    'a fresh retry applies current proposals'
  );
};
