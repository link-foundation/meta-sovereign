import {
  boundedBrowserText,
  browserReviewId,
} from './question-browser-state.js';
import { validUnreadNotice } from './question-unread-notice-state.js';
import { validUnreadPolling } from './question-unread-polling-state.js';
import { browserUnreadId, unreadFailure } from './question-unread-identity.js';
export { browserUnreadId, unreadFailure } from './question-unread-identity.js';

export const validUnreadCoverage = (value) =>
  value?.complete === false &&
  value.scope === 'unread-conversations' &&
  boundedBrowserText(value.reason, 120) &&
  Number.isInteger(value.observed) &&
  value.observed >= 0 &&
  Number.isInteger(value.visited) &&
  value.visited >= 0 &&
  value.visited <= 100 &&
  value.observed >= value.visited;

const validUnreadHistory = (value) =>
  typeof value?.positionRestored === 'boolean' &&
  typeof value.reusedOwnedForward === 'boolean' &&
  Number.isSafeInteger(value.lengthBefore) &&
  value.lengthBefore > 0 &&
  Number.isSafeInteger(value.lengthAfter) &&
  value.lengthAfter > 0;

export const validUnreadRestoration = (value) =>
  typeof value?.restored === 'boolean' &&
  boundedBrowserText(value.reason, 120) &&
  (value.replyView === undefined ||
    (['revealed', 'owner-draft', 'owner-active', 'unavailable'].includes(
      value.replyView?.state
    ) &&
      boundedBrowserText(value.replyView.chat, 480) &&
      boundedBrowserText(value.replyView.messageId, 480) &&
      (value.replyView.state !== 'revealed' || value.restored))) &&
  (value.history === undefined ||
    (validUnreadHistory(value.history) &&
      (!value.restored || value.history.positionRestored)));

const validUnreadEntry = (entry, source) =>
  boundedBrowserText(entry?.chat, 480) &&
  (entry.reviewId === undefined || browserReviewId(entry.reviewId)) &&
  (entry.preview === undefined || boundedBrowserText(entry.preview, 600)) &&
  (entry.code === undefined || boundedBrowserText(entry.code, 120)) &&
  (entry.notice === undefined ||
    validUnreadNotice(entry.notice, source, entry.chat));

const validUnreadIdentity = (value, id) =>
  value &&
  !value.error &&
  !(value.httpStatus >= 400) &&
  value.mode === 'browser-unread-review' &&
  browserUnreadId(value.id) &&
  value.id === id &&
  boundedBrowserText(value.source, 80) &&
  ['active', 'completed', 'failed', 'paused', 'stopped'].includes(
    value.state
  ) &&
  typeof value.owned === 'boolean' &&
  validUnreadPolling(value.polling, id) &&
  (value.noticeReplies === undefined ||
    typeof value.noticeReplies === 'boolean') &&
  (value.state !== 'active' || value.owned);

const invalidUnreadEntries = (value) =>
  !Array.isArray(value.entries) ||
  value.entries.length > 100 ||
  (!value.noticeReplies &&
    value.entries.some((entry) => entry.notice !== undefined)) ||
  !value.entries.every((entry) => validUnreadEntry(entry, value.source)) ||
  new Set(value.entries.map((entry) => entry.chat)).size !==
    value.entries.length;

const invalidUnreadCompletion = (value) =>
  (value.coverage !== null && !validUnreadCoverage(value.coverage)) ||
  (value.restoration !== null && !validUnreadRestoration(value.restoration)) ||
  (value.state === 'completed' && (!value.coverage || !value.restoration)) ||
  (value.state === 'completed' &&
    value.entries.length !== value.coverage?.visited) ||
  (value.state === 'completed' &&
    value.noticeReplies &&
    value.entries.some((entry) => entry.notice === undefined)) ||
  (value.coverage && value.entries.length > value.coverage.visited);

export const validUnreadReplyView = (value) => {
  const reply = value.restoration?.replyView;
  return (
    !reply ||
    (value.noticeReplies &&
      value.entries.some(
        (entry) =>
          entry.chat === reply.chat &&
          entry.notice?.phase === 'sent' &&
          entry.notice.outbox?.receipt?.messageId === reply.messageId
      ))
  );
};

/** Both wire formats must retain uncertainty and bind recovery to the caller's ID. */
export const checkUnreadReview = (value, id) => {
  if (
    !validUnreadIdentity(value, id) ||
    invalidUnreadEntries(value) ||
    invalidUnreadCompletion(value) ||
    !validUnreadReplyView(value)
  ) {
    throw unreadFailure(
      value?.code ?? 'question-unread-unconfirmed',
      value?.error ?? 'The unread review pass was not confirmed.'
    );
  }
  return value;
};
