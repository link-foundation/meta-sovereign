export const enUnreadReview = {
  'browserUnread.title': 'Unread conversations',
  'browserUnread.hint':
    'Read a bounded set of unread chats in an already connected, inactive provider window. Keep that window inactive until the pass settles. Saved answers prepare reviews; this pass never sends or calls a model. Rendered lists and history may be incomplete.',
  'browserUnread.limit': 'Maximum chats (1–100)',
  'browserUnread.confirm': 'Opening chats may mark messages as read.',
  'browserUnread.start': 'Read unread chats for review',
  'browserUnread.unconfirmed':
    'Recover the saved pass before starting another. Recovery does not open chats again.',
  'browserUnread.recover': 'Recover unread pass status',
  'browserUnread.stop': 'Stop unread pass and wait',
  'browserUnread.active':
    'Reading unread conversations. No replies are being sent.',
  'browserUnread.completed':
    'The unread pass finished. Review the observed questions below.',
  'browserUnread.failed':
    'The unread pass failed. Check the provider window before starting another.',
  'browserUnread.stopped':
    'The unread pass stopped and its pending action settled.',
  'browserUnread.paused':
    'This server session does not own the saved pass. It will not restart it automatically.',
  'browserUnread.coverage':
    'Visited {visited} of {observed} observed chats. This does not prove that all unread chats or messages were found.',
  'browserUnread.restored': 'The original provider view was restored.',
  'browserUnread.history':
    'Browser history entries: {before} before, {after} after.',
  'browserUnread.notRestored':
    'The original view could not be fully restored. Check the provider window; newer owner changes were preserved.',
  'browserUnread.review': 'Review chat {chat}',
  'browserUnread.unverified': 'Chat {chat} has no verified question review.',
  'browserUnread.notices':
    'Apply enabled acknowledgement and rejection reply policies',
  'browserUnread.noticesHint':
    'Use a bounded pass in an already connected, inactive provider window. Enabled saved notice policies may send approved exact acknowledgement answers or one configured rejection reply per chat after complete history is verified. Keep the window inactive. Questions and invitations stay in review; no model is called.',
  'browserUnread.startNotices': 'Apply notice policies to unread chats',
  'browserUnread.activeNotices':
    'Visiting unread chats and applying the enabled notice reply policies. Wait for actual delivery and restoration receipts.',
  'browserUnread.pausedNotices':
    'Notice replies are paused. Inspect the saved outcomes and outbox before starting another pass. This saved pass will not restart automatically.',
};
