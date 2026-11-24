export const enUnreadReview = {
  'browserUnread.waitingHint':
    'A chat stays open until you reply or skip. It can already be marked read. Leaving this browser tab inactive lets the next check run.',
  'browserUnread.watch.visiting': 'Checking conversations now.',
  'browserUnread.watch.waiting': 'Waiting for the next check.',
  'browserUnread.watch.starting': 'Starting repeated checks.',
  'browserUnread.watchWaiting':
    'Include already-read HeadHunter chats awaiting your reply',
  'browserUnread.startWaiting': 'Watch HeadHunter chats awaiting your reply',
  'browserUnread.heldWaiting':
    'Chat {chat} is open for review. Reply in HeadHunter or skip this question to continue.',
  'browserUnread.skip': 'Skip this question',
  'browserUnread.skipConfirmed': 'Skipped the question in chat {chat}.',
  'browserUnread.waitingCoverage':
    'Visited {visited} of {observed} visible chats. The full list may contain more conversations.',
  'browserUnread.answer.skipped': 'Question skipped.',
  'browserUnread.reviewChoices': 'Leave bot choices for manual selection',
  'browserUnread.activeReviewChoices':
    'Checking unread questions. Bot choices and drafts stay open for your review.',
  'browserUnread.answer.choice-review':
    'Choose an option in the provider chat.',
  'browserUnread.historyAnswers.saved':
    'Answers saved from chat history ({count}) for review.',
  'browserUnread.historyAnswers.hold':
    'Chat history learning could not be confirmed. Check this chat before continuing.',
  'browserUnread.summary.saved':
    'Answers saved from summary ({count}). No reply is needed.',
  'browserUnread.summary.learned': 'Answers saved from summary ({count}).',
  'browserUnread.summary.hold':
    'Check this chat to confirm its summary. The next chat is waiting.',
  'browserUnread.form.enable':
    'Prepare linked questionnaires and HeadHunter rating polls for review',
  'browserUnread.answer.form-review': 'Opened for review in Forms.',
  'browserUnread.form.rating-ready':
    'Company search is ready. Choose and submit your own ratings on HeadHunter.',
  'browserUnread.form.rating-closed':
    'HeadHunter has closed voting for this poll.',
  'browserUnread.form.rating-sign-in':
    'Sign in to HeadHunter in the poll window to continue.',
  'browserUnread.form.rating-unavailable':
    'Check the company search in the HeadHunter poll window.',
  'browserUnread.form.prefilled':
    'Prefilled fields ({count}). Review the questionnaire before submitting.',
  'browserUnread.form.partial':
    'Prefilled fields ({count}). Review the questionnaire and complete any remaining fields.',
  'browserUnread.form.waiting-owner':
    'The questionnaire needs your attention in Forms.',
  'browserUnread.form.refused': 'The questionnaire could not be prepared.',
  'browserUnread.form.slot-limit':
    'All Forms slots are occupied. Free a slot to prepare the questionnaire.',
  'browserUnread.form.unconfirmed':
    'The questionnaire result could not be confirmed. Check the latest page before editing.',
  'browserUnread.form.closed':
    'The questionnaire was already prepared in a review that has since closed.',
  'browserUnread.form.open': 'Review {slot} in Forms',
  'browserUnread.answers':
    'Handle bot options and hold ordinary replies for review',
  'browserUnread.answersHint':
    'Visit unread chats one at a time in the inactive provider window. Verified past replies and completed summary answers are saved for review. By default, exact saved answers, unique completed summaries and approved salary targets with one containing band may select an offered bot option. Ordinary replies stay as drafts. Later checks wait on the first chat needing your review. You can enable model drafts separately.',
  'browserUnread.startAnswers': 'Handle unread answers sequentially',
  'browserUnread.activeAnswers':
    'Checking unread questions. Approved bot options may be selected; ordinary replies remain drafts for your review.',
  'browserUnread.pausedAnswers':
    'Answer processing is paused. Inspect the held chat and saved outbox before starting another pass. Status recovery never repeats an action.',
  'browserUnread.held':
    'Chat {chat} is left open for review. Its draft is preserved. Repeated checks inspect only this chat until you reply or no reply is needed.',
  'browserUnread.answer.review': 'Needs your review.',
  'browserUnread.answer.no-reply': 'No reply is needed.',
  'browserUnread.answer.pending-options': 'Waiting for offered bot options.',
  'browserUnread.answer.owner-draft': 'Your existing draft is preserved.',
  'browserUnread.answer.prefilled':
    'Draft prepared for your review; no text was sent.',
  'browserUnread.answer.selecting': 'An exact bot option is being selected.',
  'browserUnread.answer.sent':
    'A bot option was confirmed by an outgoing message.',
  'browserUnread.answer.marked-sent': 'You marked this selection as sent.',
  'browserUnread.answer.unknown':
    'Selection delivery is uncertain; inspect the provider chat.',
  'browserUnread.answer.failed':
    'The option was refused; inspect the saved outcome.',

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
  'browserUnread.restoredReply':
    'The original chat, filter and empty composer were restored. Confirmed reply {id} was revealed in place of the earlier reading position.',
  'browserUnread.replyNotRevealed':
    'Reply {id} was confirmed, but was not revealed. The owner’s draft and reading position take priority; check the provider window.',
  'browserUnread.history':
    'Browser history entries: {before} before, {after} after.',
  'browserUnread.notRestored':
    'The original view could not be fully restored. Check the provider window; newer owner changes were preserved.',
  'browserUnread.review': 'Review chat {chat}',
  'browserUnread.unverified': 'Chat {chat} has no verified question review.',
  'browserUnread.notices':
    'Apply enabled acknowledgement and rejection reply policies',
  'browserUnread.noticesHint':
    'In an inactive provider window, this pass checks unread chats. HeadHunter checks the selected chat first for an eligible acknowledgement, even if it is marked read. Complete history is required before an enabled policy can send approved thanks or one configured rejection reply per chat. Questions and invitations stay in review.',
  'browserUnread.startNotices': 'Apply notice policies to unread chats',
  'browserUnread.activeNotices':
    'Visiting unread chats and applying the enabled notice reply policies. Wait for actual delivery and restoration receipts.',
  'browserUnread.pausedNotices':
    'Notice replies are paused. Inspect the saved outcomes and outbox before starting another pass. This saved pass will not restart automatically.',
  'browserUnread.polling': 'Repeat unread checks',
  'browserUnread.pollingHint':
    'Each pass uses the same confirmed settings while the provider stays inactive. Stop waits for issued work. Uncertain delivery or restoration pauses checking; recovery never restarts it.',
  'browserUnread.intervalMs': 'Check interval in seconds (1–7200)',
  'browserUnread.durationMs': 'Run duration in minutes (1–1440)',
  'browserUnread.retryMaxMs':
    'Maximum retry delay in seconds (at least the interval)',
  'browserUnread.maxFailures': 'Consecutive failures before pause (1–10)',
  'browserUnread.poll.starting': 'Starting repeated unread checks.',
  'browserUnread.poll.visiting':
    'An unread pass is in progress. Displayed receipts belong to the pass identified below.',
  'browserUnread.poll.waiting': 'Waiting for the next unread check.',
  'browserUnread.poll.owner-active':
    'The provider window is active. Waiting without opening chats.',
  'browserUnread.poll.backoff':
    'A definitely unissued or restored empty pass failed. Waiting before retry.',
  'browserUnread.poll.settled':
    'Repeated checking has stopped or paused. Recovering status does not resume it.',
  'browserUnread.pollCounts':
    'Settled passes: {passes}. Consecutive failures: {failures}/{max}. Ends at {expires}.',
  'browserUnread.pollNext': 'Next check at {next}.',
  'browserUnread.pollReceipt': 'Displayed receipts are from pass {id}.',
};
