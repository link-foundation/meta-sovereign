import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../src/storage/universal.js';
import {
  planAutomation,
  normalizeAutomation,
} from '../src/automation/automations.js';
import { sourceMessageLinkProperties } from '../src/sources/message-text-links.js';
import { htmlToSafe } from '../src/sources/email-html.js';
import { buildEmailMessageLink } from '../src/sources/email.js';
import {
  readChatAnswerInput,
  validateAnswerDraft,
} from '../src/automation/question-store.js';
import {
  assertQuestionLinkDelivery,
  assertQuestionLinkSurfaces,
} from './helpers/question-links-integration.mjs';
import {
  emailLinkKinds,
  emailLinkMessage,
  emailLinkTarget,
  emailLinkAutomation,
  apiLinkRule,
} from '../../experiments/issue-56/question-email-links-fixture.mjs';

const plan = (message, rule = apiLinkRule) =>
  planAutomation([rule, message], emailLinkAutomation, {
    self: ['me'],
    targets: [{ source: 'email', chat: message.chat }],
  });

test('MIME, Gmail, JMAP and Graph preserve alternative destinations in frozen review', async () => {
  for (const kind of emailLinkKinds) {
    const message = emailLinkMessage(kind);
    assert.equal(message.body, apiLinkRule.question, kind);
    assert.deepEqual(message.links, [emailLinkTarget(kind)], kind);
    // Existing stored trees must work even when their old importer omitted links.
    delete message.links;
    const [draft] = plan(message).drafts;
    assert.equal(draft.answer.requiresReview, true, kind);
    assert.deepEqual(
      draft.answer.turn.messages[0].links,
      [emailLinkTarget(kind)],
      kind
    );
    const store = createMemoryStore();
    await store.put(message);
    assert.equal(
      (await readChatAnswerInput(store, emailLinkAutomation, draft)).ok,
      true,
      kind
    );
    await store.put(emailLinkMessage(kind, true));
    assert.equal(
      (
        await validateAnswerDraft(store, emailLinkAutomation, draft, {
          reviewed: true,
        })
      ).code,
      'answer-changed',
      kind
    );
  }
});

test('safe trees preserve source order, repeated targets and decoded URL bytes', () => {
  const a = emailLinkTarget('mime');
  const b = emailLinkTarget('mime', true);
  const { tree, links } = htmlToSafe(
    `<p><a href="${a}&amp;mode=Full">first</a><b><a href="${b}">next</a></b><a href="${a}">again</a></p>`
  );
  assert.deepEqual(links, [`${a}&mode=Full`, b, a]);
  assert.deepEqual(
    sourceMessageLinkProperties({ source: 'email', bodyTree: tree }),
    { links }
  );
  assert.deepEqual(
    sourceMessageLinkProperties({ source: 'vk', bodyTree: tree }),
    {}
  );
});

test('unknown, conflicting, malformed and bounded-out email trees refuse planning', () => {
  const message = emailLinkMessage();
  const a = {
    t: 'a',
    href: emailLinkTarget('mime'),
    c: [{ t: 'text', s: 'experience' }],
  };
  const cycle = { t: 'b', c: [] };
  cycle.c.push(cycle);
  for (const bodyTree of [
    {},
    [null],
    [{ ...a, href: 'http://' }],
    [{ ...a, linkUnverified: true }],
    [{ ...a, c: {} }],
    [{ ...a, t: 'unknown' }],
    Array(21).fill(a),
    [cycle],
  ]) {
    const changed = { ...message, bodyTree };
    assert.deepEqual(sourceMessageLinkProperties(changed), { links: null });
    assert.equal(plan(changed).drafts.length, 0);
  }
  assert.deepEqual(
    sourceMessageLinkProperties({
      ...message,
      links: [emailLinkTarget('mime', true)],
    }),
    { links: null }
  );
});

test('HTML truncation, unsupported destinations and depth loss retain an explicit refusal', () => {
  for (const html of [
    '<a href="https://example.test/a b">experience</a>',
    `<a href="https://example.test/${'a'.repeat(2000)}">experience</a>`,
    '<a href="javascript:prompt(1)">experience</a>',
    `${'<div>'.repeat(45)}experience${'</div>'.repeat(45)}`,
  ]) {
    const safe = htmlToSafe(html);
    assert.equal(safe.links, null);
    const message = buildEmailMessageLink({
      ...emailLinkMessage(),
      bodyTree: safe.tree,
      links: safe.links,
    });
    assert.equal(message.body, apiLinkRule.question);
    assert.equal(message.links, null);
    assert.equal(plan(message).drafts.length, 0);
  }
});

test('reviewed email answers deliver once and ordinary visible links retain automatic reuse', async () => {
  for (const kind of emailLinkKinds) {
    await assertQuestionLinkDelivery({
      message: emailLinkMessage(kind),
      rule: apiLinkRule,
      configuration: emailLinkAutomation,
      requiresReview: true,
    });
  }
  const message = emailLinkMessage('graph');
  message.body = `${apiLinkRule.question} ${emailLinkTarget('graph')}`;
  await assertQuestionLinkDelivery({
    message,
    rule: { ...apiLinkRule, question: message.body },
    configuration: emailLinkAutomation,
    requiresReview: false,
  });
});

test(
  'foreground CLI and both Lino formats retain email alternative destinations',
  { timeout: 20000 },
  async () => {
    for (const kind of emailLinkKinds) {
      const store = createMemoryStore();
      for (const record of [
        apiLinkRule,
        emailLinkMessage(kind),
        normalizeAutomation(emailLinkAutomation),
      ]) {
        await store.put(record);
      }
      await assertQuestionLinkSurfaces({
        store,
        automation: emailLinkAutomation,
        target: emailLinkTarget(kind),
        chat: `email:${emailLinkMessage(kind).chat}`,
      });
    }
  }
);
