import {
  identityQuestionForm,
  incomingPersonalVk,
} from '../crm/identity-question.js';
import { personalReplyDraft } from './personal-reply.js';

export const identityMessageReason = (
  message,
  isSelf = (sender) => sender === 'me'
) => {
  if (!incomingPersonalVk(message, isSelf)) {
    return 'identity-incoming-required';
  }
  return identityQuestionForm(message.body)
    ? null
    : 'identity-question-required';
};

export const identityDraft = (automation, candidate, draft, isSelf) =>
  personalReplyDraft(
    automation,
    candidate,
    draft,
    isSelf,
    'identity',
    identityMessageReason
  );
