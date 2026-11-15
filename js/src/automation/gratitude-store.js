import {
  contextualReplyKinds,
  contextualHistory,
  contextualMessageReason,
} from './contextual-replies.js';
import {
  gratitudeFingerprint,
  latestGratitudeMessage,
  gratitudeMessageReason,
} from './gratitude.js';
import { identityMessageReason } from './identity.js';
import { acquaintanceMessageReason } from './acquaintance.js';
import { greetingDestinationReason } from '../greetings/plan.js';
import { messageTime } from '../crm/message-time.js';
import { editId, normalizeAutomation, withEdit } from './automations.js';
import { matchesVkSequenceReceipt } from './vk-sequence-receipt.js';

// Retain three latest records at most (including a possible preceding-turn tie); a large archive never becomes a second
// in-memory history. Ties and unorderable records refuse instead of guessing.
const latestFromStore = async (store, draft, acknowledged) => {
  let recent = [];
  let invalid = false;
  let count = 0;
  const select = (link) =>
    link?.id?.startsWith('msg:') &&
    link.source === draft.source &&
    String(link.chat) === String(draft.chat);
  const consume = (batch) => {
    for (const message of batch) {
      if (draft.engagement && matchesVkSequenceReceipt(message, acknowledged)) {
        continue;
      }
      const merged = [...recent, message];
      count += 1;
      const time = (m) => messageTime(m.timestamp);
      if (
        !Number.isFinite(time(message)) ||
        greetingDestinationReason({ ...message, network: message.source })
      ) {
        invalid = true;
      }
      recent = merged.sort((a, b) => time(b) - time(a)).slice(0, 3);
    }
  };
  if (store.scan) {
    await store.scan(select, 256, consume, (link) => ({
      id: link.id,
      source: link.source,
      chat: link.chat,
      sender: link.sender,
      body: link.body,
      sticker: link.sticker && { id: link.sticker.id },
      timestamp: link.timestamp,
      outgoing: link.outgoing,
      out: link.out,
      deleted: link.deleted,
      service: link.service,
      chatType: link.chatType,
    }));
  } else {
    consume(await store.query(select));
  }
  return {
    latest: invalid ? null : latestGratitudeMessage(recent),
    messages: invalid ? [] : recent,
    count,
  };
};

const replyReasons = new Map([
  ['gratitude', gratitudeMessageReason],
  ['identity', identityMessageReason],
  ['acquaintance', acquaintanceMessageReason],
  ...[...contextualReplyKinds, 'engagement'].map((key) => [
    key,
    (message, isSelf) => contextualMessageReason(key, message, isSelf),
  ]),
]);
const contextKey = (automation, draft) =>
  [...replyReasons.keys()].find(
    (key) => automation.action.kind === `reply-${key}` || draft[key]
  ) ?? 'gratitude';

const sameContext = (current, proof) =>
  current !== false &&
  JSON.stringify(current) === JSON.stringify(proof.context ?? null);

const samePolicy = (automation, current, proof, key) =>
  JSON.stringify(automation.action) === proof.policy &&
  JSON.stringify(current.action) === proof.policy &&
  (key !== 'engagement' ||
    automation.action.stickerIds.includes(proof.sticker));

export const validatePersonalReplyDraft = async (
  store,
  automation,
  draft,
  self = [],
  { acknowledged = null } = {}
) => {
  const key = contextKey(automation, draft);
  if (
    !replyReasons.has(automation.action.kind.replace(/^reply-/u, '')) &&
    !draft[key]
  ) {
    return { ok: true };
  }
  const history = await latestFromStore(store, draft, acknowledged);
  const { latest } = history;
  const proof = draft[key];
  const reasonFor = replyReasons.get(key);
  const owners = new Set(['me', ...self.map(String)]);
  const saved = await store.get(automation.id);
  const currentContext = contextualHistory(
    key,
    history.messages,
    (sender) => owners.has(String(sender)),
    history.count
  );
  const current = saved
    ? withEdit(normalizeAutomation(saved), await store.get(editId(saved)))
    : automation;
  if (
    automation.action.kind !== `reply-${key}` ||
    !proof ||
    reasonFor(latest, (sender) => owners.has(String(sender))) ||
    latest.id !== proof.message ||
    gratitudeFingerprint(latest) !== proof.fingerprint ||
    !samePolicy(automation, current, proof, key) ||
    !validContent(draft, proof) ||
    !sameContext(currentContext, proof)
  ) {
    return {
      ok: false,
      code: `${key}-stale`,
      error:
        'Review the latest personal message and reply again before sending',
    };
  }
  return { ok: true };
};

const validContent = (draft, proof) =>
  draft.sticker
    ? draft.source === 'vk' &&
      String(draft.sticker.id) === proof.sticker &&
      !draft.text
    : Boolean(String(draft.text ?? '').trim());

export const validateGratitudeDraft = validatePersonalReplyDraft;
