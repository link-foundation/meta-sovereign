import assert from 'node:assert/strict';
import { createMemoryStore } from '../../js/src/storage/universal.js';
import { planAutomation } from '../../js/src/automation/automations.js';
import { readChatAnswerInput } from '../../js/src/automation/question-store.js';
import {
  emailLinkKinds,
  emailLinkMessage,
  emailLinkAutomation,
  apiLinkRule,
} from './question-email-links-fixture.mjs';

const before = process.argv.includes('--before');
for (const kind of emailLinkKinds) {
  const message = emailLinkMessage(kind);
  const [draft] = planAutomation([apiLinkRule, message], emailLinkAutomation, {
    self: ['me@example.test'],
    targets: [{ source: 'email', chat: message.chat }],
  }).drafts;
  assert.ok(draft, kind);
  const store = createMemoryStore();
  await store.put(message);
  const current = await readChatAnswerInput(store, emailLinkAutomation, draft);
  assert.equal(current.ok, true, kind);
  await store.put(emailLinkMessage(kind, true));
  const changed = await readChatAnswerInput(store, emailLinkAutomation, draft);
  const guarded =
    draft.answer.requiresReview && changed.code === 'answer-changed';
  console.log(
    JSON.stringify({
      kind,
      body: message.body,
      requiresReview: draft.answer.requiresReview,
      links: draft.answer.turn.messages[0].links ?? [],
      changedTarget: changed.code ?? changed.ok,
      guarded,
    })
  );
  assert.equal(guarded, !before, kind);
}
