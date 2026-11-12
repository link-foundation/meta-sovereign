import {
  boundedBrowserText,
  browserTextReceipt,
} from './question-browser-state.js';
import { outboxId } from './outbox.js';

const phases = [
  'waiting',
  'owner-draft',
  'review',
  'ignored',
  'ready',
  'selecting',
  'sent',
  'marked-sent',
  'unknown',
  'failed',
];

const validSelectedOutbox = (outbox, selection, source, chat) =>
  !outbox ||
  (outbox.id === outboxId(selection.key) &&
    outbox.source === source &&
    outbox.chat === chat &&
    outbox.text === selection.text &&
    ['sending', 'sent', 'unknown', 'failed'].includes(outbox.status));

const validSentNotice = ({ phase, outbox, selection }, source, chat) =>
  outbox?.status === 'sent' &&
  (phase === 'marked-sent'
    ? outbox.resolvedBy === 'user'
    : outbox.resolvedBy !== 'user' &&
      Boolean(
        browserTextReceipt(outbox.receipt, {
          source,
          chat,
          text: selection.text,
        })
      ));

const validSelection = (notice, source, chat) => {
  const { selection, outbox } = notice;
  if (!selection) {
    return (
      !outbox &&
      ['waiting', 'owner-draft', 'review', 'ignored', 'ready'].includes(
        notice.phase
      )
    );
  }
  if (
    selection.type !== 'text' ||
    selection.chat !== chat ||
    !boundedBrowserText(selection.key, 2000) ||
    !boundedBrowserText(selection.text, 12000)
  ) {
    return false;
  }
  if (!validSelectedOutbox(outbox, selection, source, chat)) {
    return false;
  }
  if (notice.phase === 'sent' || notice.phase === 'marked-sent') {
    return validSentNotice(notice, source, chat);
  }
  return (
    notice.phase !== 'unknown' ||
    ['sending', 'unknown'].includes(outbox?.status)
  );
};

/** Validate positive receipt identity on the server and both wire clients. */
export const validUnreadNotice = (notice, source, chat) =>
  Boolean(
    notice &&
    phases.includes(notice.phase) &&
    (notice.kind === null ||
      ['acknowledgements', 'rejections', 'invitations'].includes(
        notice.kind
      )) &&
    (notice.reason === undefined || boundedBrowserText(notice.reason, 120)) &&
    validSelection(notice, source, chat)
  );

/** Read-only reconciliation also recovers a lost post-send pass update. */
export const unreadNoticeStatus = async (store, entry) => {
  const notice = entry.notice;
  if (!notice?.selection) {
    return entry;
  }
  const stored = await store.get(outboxId(notice.selection.key));
  const outbox =
    notice.outbox?.status === 'sent'
      ? notice.outbox
      : (stored ?? notice.outbox);
  if (!outbox) {
    return entry;
  }
  const phase =
    outbox.status === 'sent'
      ? outbox.resolvedBy === 'user'
        ? 'marked-sent'
        : 'sent'
      : ['sending', 'unknown'].includes(outbox.status)
        ? 'unknown'
        : 'failed';
  return {
    ...entry,
    notice: {
      ...notice,
      outbox,
      phase,
      selection: { ...notice.selection, text: outbox.text },
    },
  };
};
