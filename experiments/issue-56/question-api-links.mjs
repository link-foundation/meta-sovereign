import assert from 'node:assert/strict';
import { createMemoryStore } from '../../js/src/storage/universal.js';
import { planAutomation } from '../../js/src/automation/automations.js';
import { readChatAnswerInput } from '../../js/src/automation/question-store.js';
import {
  apiLink,
  apiLinkRule,
  apiLinkAutomation,
  apiLinkMessage,
} from './question-api-links-fixture.mjs';

const before = process.argv.includes('--before');
for (const kind of ['bot', 'caption', 'mtproto', 'archive']) {
  const message = await apiLinkMessage(kind);
  const plan = planAutomation([apiLinkRule, message], apiLinkAutomation, {
    self: ['me'],
    targets: [{ source: 'telegram', chat: '7' }],
  });
  assert.equal(plan.drafts.length, 1);
  const draft = plan.drafts[0];
  const store = createMemoryStore();
  await store.put(message);
  assert.equal(
    (await readChatAnswerInput(store, apiLinkAutomation, draft)).ok,
    true
  );
  await store.put(await apiLinkMessage(kind, apiLink.second));
  const changed = await readChatAnswerInput(store, apiLinkAutomation, draft);
  const guarded =
    draft.answer.requiresReview === true && changed.code === 'answer-changed';
  console.log(
    JSON.stringify({
      kind,
      requiresReview: draft.answer.requiresReview,
      frozenLinks: draft.answer.turn.messages[0].links ?? [],
      changedTarget: changed.code ?? changed.ok,
      guarded,
    })
  );
  assert.equal(guarded, !before);
}
