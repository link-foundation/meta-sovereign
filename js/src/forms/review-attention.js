import { formFailure as failure } from './options.js';
import { bindAttentionPage } from '../automation/attention-foreground.js';

const activeReview = (record) =>
  record.state === 'open' &&
  record.task &&
  !record.cancelled &&
  !record.browser?.page?.isClosed?.();

const waitingAttention = (record, now) => {
  const result = record.lastPrefill?.result;
  const wait = result?.wait;
  if (
    !activeReview(record) ||
    result?.state !== 'waiting-owner' ||
    !result.requestId ||
    wait?.kind !== 'captcha' ||
    !(Date.parse(wait.expiresAt) > now)
  ) {
    return null;
  }
  const { page, policy } = record.browser;
  return bindAttentionPage(
    {
      id: record.id,
      browserSlot: record.slot,
      requestId: result.requestId,
      kind: wait.kind,
      startedAt: wait.startedAt,
      expiresAt: wait.expiresAt,
      focusAvailable:
        policy?.headless === false && typeof page?.bringToFront === 'function',
    },
    page
  );
};

export const reviewAttention = (records, observedAt) => ({
  ok: true,
  attention: [...records]
    .map((record) => waitingAttention(record, observedAt))
    .filter(Boolean),
});

export const checkAttentionFocus = (record, requestId, now) => {
  const current = waitingAttention(record, now);
  if (!current || current.requestId !== requestId) {
    throw failure(
      'form-attention-ended',
      'This review is no longer waiting for that request.'
    );
  }
  if (!current.focusAvailable) {
    throw failure(
      'form-focus-unavailable',
      'This browser cannot focus a review window.'
    );
  }
};
