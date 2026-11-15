import {
  gratitudeFingerprint,
  latestGratitudeMessage,
  gratitudeMessageReason,
} from './gratitude.js';
import { identityMessageReason } from './identity.js';
import { greetingDestinationReason } from '../greetings/plan.js';
import { messageTime } from '../crm/message-time.js';
import { editId, normalizeAutomation, withEdit } from './automations.js';

// Retain two latest records at most; a large archive never becomes a second
// in-memory history. Ties and unorderable records refuse instead of guessing.
const latestFromStore = async (store, draft) => {
  let recent = [];
  let invalid = false;
  const select = (link) =>
    link?.id?.startsWith('msg:') &&
    link.source === draft.source &&
    String(link.chat) === String(draft.chat);
  const consume = (batch) => {
    for (const message of batch) {
      const merged = [...recent, message];
      const latest = latestGratitudeMessage(merged);
      const time = (m) => messageTime(m.timestamp);
      if (
        !Number.isFinite(time(message)) ||
        greetingDestinationReason({ ...message, network: message.source })
      ) {
        invalid = true;
      }
      recent = latest
        ? [latest]
        : merged.sort((a, b) => time(b) - time(a)).slice(0, 2);
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
  return invalid ? null : latestGratitudeMessage(recent);
};

const contextKey = (automation, draft) =>
  automation.action.kind === 'reply-identity' || draft.identity
    ? 'identity'
    : 'gratitude';

export const validatePersonalReplyDraft = async (
  store,
  automation,
  draft,
  self = []
) => {
  const key = contextKey(automation, draft);
  if (
    !['reply-gratitude', 'reply-identity'].includes(automation.action.kind) &&
    !draft[key]
  ) {
    return { ok: true };
  }
  const latest = await latestFromStore(store, draft);
  const proof = draft[key];
  const reasonFor =
    key === 'identity' ? identityMessageReason : gratitudeMessageReason;
  const owners = new Set(['me', ...self.map(String)]);
  const saved = await store.get(automation.id);
  const current = saved
    ? withEdit(normalizeAutomation(saved), await store.get(editId(saved)))
    : automation;
  if (
    automation.action.kind !== `reply-${key}` ||
    !proof ||
    reasonFor(latest, (sender) => owners.has(String(sender))) ||
    latest.id !== proof.message ||
    gratitudeFingerprint(latest) !== proof.fingerprint ||
    JSON.stringify(automation.action) !== proof.policy ||
    JSON.stringify(current.action) !== proof.policy ||
    !validContent(draft, proof)
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
