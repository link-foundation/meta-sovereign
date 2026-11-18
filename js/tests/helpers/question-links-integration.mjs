import assert from 'node:assert/strict';
import { createMemoryStore } from '../../src/storage/universal.js';
import { normalizeAutomation } from '../../src/automation/automations.js';
import { createAutomationRunner } from '../../src/automation/runner.js';
import { createAutomationCommands } from '../../src/cli/automation-commands.js';
import { startQuestionFixtureServer } from './question-fixture-server.mjs';
import {
  LINO_TEXT,
  LINO_BINARY,
  encodeWire,
  readWireResponse,
} from '../../src/transport/lino.js';

export const assertQuestionLinkDelivery = async ({
  message,
  rule,
  configuration,
  requiresReview,
}) => {
  const store = createMemoryStore();
  await store.put(rule);
  await store.put(message);
  const automation = normalizeAutomation({
    ...configuration,
    pacing: { typing: false },
  });
  await store.put(automation);
  const sent = [];
  const runner = createAutomationRunner({
    store,
    self: ['me'],
    send: async (draft) => {
      sent.push(draft);
      return { status: 'sent', messageId: '2' };
    },
  });
  const plan = await runner.plan(automation, {
    targets: [{ source: message.source, chat: message.chat }],
  });
  assert.equal(plan.drafts.length, 1);
  assert.equal(plan.drafts[0].answer.requiresReview, requiresReview);
  const result = await runner.deliverDraft(automation, plan.drafts[0]);
  assert.equal(result.status === 'sent', !requiresReview);
  assert.equal(sent.length, requiresReview ? 0 : 1);
  if (requiresReview) {
    assert.equal(
      (
        await runner.sendDraft(plan.drafts[0].id, {
          confirm: true,
        })
      ).status,
      'sent'
    );
    await assert.rejects(
      runner.sendDraft(plan.drafts[0].id, { confirm: true }),
      /no draft/u
    );
  }
  assert.notEqual(
    (await runner.deliverDraft(automation, plan.drafts[0])).status,
    'sent'
  );
  assert.equal(sent.length, 1);
};

export const assertQuestionLinkSurfaces = async ({
  store,
  automation,
  target,
  chat = 'telegram:7',
}) => {
  const cli = createAutomationCommands({ openStore: async () => store });
  const lines = [];
  assert.equal(
    await cli.automations({ _: ['plan', automation.id], chat }, (line) =>
      lines.push(line)
    ),
    0
  );
  assert.equal(
    lines.some((line) => line.includes(target)),
    true,
    lines.join('\n')
  );
  assert.equal(
    lines.some((line) => line.includes('review required: true')),
    true
  );
  const server = await startQuestionFixtureServer({ store });
  try {
    for (const type of [LINO_TEXT, LINO_BINARY]) {
      const response = await fetch(
        `http://127.0.0.1:${server.port}/api/automations/plan`,
        {
          method: 'POST',
          headers: { accept: type, 'content-type': type },
          body: encodeWire({ automation }, type),
        }
      );
      assert.equal(response.status, 200);
      const plan = await readWireResponse(response);
      assert.equal(plan.drafts[0].answer.requiresReview, true);
      assert.deepEqual(plan.drafts[0].answer.turn.messages[0].links, [target]);
    }
  } finally {
    await server.close();
  }
};
