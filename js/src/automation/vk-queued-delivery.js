import { contextualReplyKinds } from './contextual-replies.js';
import { validatePersonalReplyDraft } from './gratitude-store.js';
import { validateAnswerDraft } from './question-store.js';
import { vkOutgoingFor } from './vk-outgoing-queue.js';

const replyMessage = async (store, draft) => {
  const proof = [
    'answer',
    'gratitude',
    'identity',
    'acquaintance',
    'engagement',
    ...contextualReplyKinds,
  ]
    .map((key) => draft[key])
    .find(
      (value) =>
        typeof value?.message === 'string' &&
        /^msg:vk:[1-9]\d*$/u.test(value.message)
    );
  const message = proof && (await store.get(proof.message));
  return message?.source === 'vk' &&
    String(message.chat) === String(draft.chat) &&
    !message.outgoing &&
    !message.out &&
    !message.raw?.out &&
    message.sender !== 'me' &&
    !message.deleted &&
    !message.service
    ? message
    : null;
};

export const queueVkDelivery = async (
  { store, outgoing, key, draft, markRead, setTyping, validate },
  work
) => {
  const message = await replyMessage(store, draft);
  return outgoing.run(
    {
      key,
      draft,
      validate,
      ...(message && markRead
        ? {
            markRead: () =>
              markRead({
                source: 'vk',
                chat: draft.chat,
                id: message.id.split(':').pop(),
              }),
          }
        : {}),
      ...(setTyping
        ? { setTyping: () => setTyping({ source: 'vk', chat: draft.chat }) }
        : {}),
    },
    work
  );
};

/** Background personal policies share the foreground runner's store FIFO. */
export const queueVkPolicyMessage = (
  context,
  original,
  key,
  draft,
  work,
  validate
) =>
  vkOutgoingFor(context.store, {
    sleep: context.sleep,
    now: context.now,
    log: context.log,
  }).run(
    {
      key,
      draft,
      signal: context.signal,
      validate,
      ...(original.live.setTyping
        ? {
            setTyping: () =>
              original.live.setTyping({ chat: draft.chat }, original.options),
          }
        : {}),
    },
    work
  );

const validatePacing = async (context, automation, draft, options) => {
  const personal = await validatePersonalReplyDraft(
    context.store,
    automation,
    draft,
    context.self,
    options
  );
  const valid =
    personal.ok && draft.answer
      ? await validateAnswerDraft(context.store, automation, draft, {
          reviewed: options.reviewed ?? false,
          now: context.clock().getTime(),
        })
      : personal;
  if (!valid.ok) {
    throw Object.assign(new Error(valid.error), {
      code: valid.code,
      definitive: true,
      fallback: false,
    });
  }
};
export const withVkDeliveryPacing =
  (context, deliver) =>
  (automation, draft, options = {}) => {
    if (
      draft.source !== 'vk' ||
      !context.outgoing ||
      (draft.engagement && !options.orderedStep)
    ) {
      return deliver(automation, draft, options);
    }
    const key = context.keyFor(automation, draft);
    return queueVkDelivery(
      {
        ...context,
        key,
        draft,
        setTyping:
          automation.pacing.typing && !draft.answer?.strictOptions
            ? context.setTyping
            : null,
        validate: () => validatePacing(context, automation, draft, options),
      },
      () => deliver(automation, draft, { ...options, queueKey: key })
    );
  };
