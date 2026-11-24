import {
  incomingPersonalVk,
  wholeVkQuestion,
} from '../crm/identity-question.js';
import {
  personalReplyDraft,
  latestReplyMessage,
  replyVariantIndex,
} from './personal-reply.js';
import {
  renderReengageText,
  templateFor,
  prefillLinkFor,
} from '../crm/reengage.js';

// Independent whole-question grammar for the pinned acquaintance trigger.
export const isAcquaintanceQuestion = (body) => {
  const question = wholeVkQuestion(body)?.replace(/^мы /u, '');
  return ['знакомы', 'знакомы с тобой', 'знакомы с вами'].includes(question);
};

export const acquaintanceMessageReason = (message, isSelf) => {
  if (!incomingPersonalVk(message, isSelf)) {
    return 'acquaintance-incoming-required';
  }
  return isAcquaintanceQuestion(message.body)
    ? null
    : 'acquaintance-question-required';
};

export const acquaintanceAlternatives = (input = {}) => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw Error('Introduction alternatives must be an address-form record');
  }
  return Object.fromEntries(
    ['informal', 'formal'].map((form) => {
      const texts = input[form] ?? [];
      if (
        !Array.isArray(texts) ||
        texts.length > 32 ||
        texts.some(
          (text) =>
            typeof text !== 'string' || !text.trim() || text.length > 4096
        )
      ) {
        throw Error(
          'Use at most 32 nonempty introductions per address form, each up to 4096 characters'
        );
      }
      return [form, [...new Set(texts)]];
    })
  );
};

export const acquaintanceText = (automation, draft, form, messageId) => {
  const choices = automation.action.alternatives?.[form] ?? [];
  const template =
    choices.length && !automation.edited?.includes(form)
      ? choices[replyVariantIndex(messageId, choices.length)]
      : templateFor(automation.action.templates, form);
  return renderReengageText(template, draft);
};

export const acquaintanceDraft = (automation, candidate, draft, isSelf) => {
  const latest = latestReplyMessage(candidate.messages);
  const text = latest
    ? acquaintanceText(automation, draft, draft.form, latest.id)
    : draft.text;
  return personalReplyDraft(
    automation,
    candidate,
    { ...draft, text, prefill: prefillLinkFor({ ...draft, text }) },
    isSelf,
    'acquaintance',
    acquaintanceMessageReason
  );
};
