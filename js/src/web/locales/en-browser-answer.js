export const enBrowserAnswer = {
  'browserAnswer.latestAfterCompleted':
    'Earlier completed summaries or approved notices need no reply. The choice applies to the latest message.',
  'questions.match.pending-turn': 'Answers to pending messages',
  'browserAnswer.wholeTurn':
    'The draft covers all pending messages. Review each answer before prefilling.',
  'questions.match.accepted-summary': 'Accepted answer summary',
  'questions.acceptedSummary.matched':
    'A completed answer summary matches this current option.',
  'questions.acceptedSummary.conflict':
    'Saved summaries do not resolve one current option. Review the question.',
  'questions.acceptedSummary.limited':
    'The stored history could not be checked completely. Review the question.',

  'browserAnswer.title': 'Provider browser answers',
  'browserAnswer.hint':
    'Read the selected provider chat, review its current question and send one exact offered option. Existing drafts stay protected. Status recovery never repeats a selection.',
  'browserAnswer.source': 'Provider',
  'browserAnswer.chat': 'Web-chat reference',
  'browserAnswer.url': 'Application page URL (optional)',
  'browserAnswer.inspect': 'Read current question and choices',
  'browserAnswer.options': 'Current offered options',
  'browserAnswer.turn': 'Pending rendered messages: {count}',
  'browserAnswer.latestOnly':
    'The answer below addresses the latest message. Earlier messages still need review.',
  'browserAnswer.boundary.outgoing':
    'Rendered messages after the last observed owner reply. Earlier history is not verified.',
  'browserAnswer.boundary.service':
    'Rendered messages after the last observed service event. Earlier history is not verified.',
  'browserAnswer.boundary.rendered-start':
    'No earlier owner reply or service event is rendered. Earlier history is unknown.',
  'browserAnswer.boundary.unknown':
    'This review has only the latest message. Pending conversation context is unknown.',
  'browserAnswer.select': 'Send “{option}” in the provider chat',
  'browserAnswer.prefill': 'Prefill the reviewed draft',
  'browserAnswer.prefilled': 'Draft prefilled; review it in the provider chat',
  'browserAnswer.recover': 'Recover selection status',
  'browserAnswer.reload': 'Reload browser capabilities and last review',
  'browserAnswer.unavailable':
    'Connect a server with browser answer support to use these controls.',
  'browserAnswer.review': 'Review the current provider question before acting.',
  'browserAnswer.sending':
    'Selection is in progress. Recover its status before another action.',
  'browserAnswer.sent': 'The provider confirmed the selected answer.',
  'browserAnswer.markedSent': 'You marked this answer as sent in the outbox.',
  'browserAnswer.unknown':
    'The selection may have gone through. Check the provider chat and resolve it in the outbox; no automatic retry will run.',
  'browserAnswer.failed':
    'Selection was refused. Read the current question before trying again.',
  'browserAnswer.receipt': 'Provider message receipt: {id}',
  'browserAnswer.ownerDraft':
    'The provider input contains a draft. Review it there before selecting an option.',
  'browserAnswer.pending':
    'Answer controls are pending or disabled. Read the current question again when they appear.',
  'browserAnswer.expired':
    'This review expired. Read the current question again.',
  'browserAnswer.error':
    'Browser answer status is unconfirmed ({code}). Recover status or read the current question again.',
  'browserAnswer.unconfirmed':
    'The selection response is unconfirmed. Recover server status before another selection.',
  'browserAnswer.outgoing':
    'The latest provider message is outgoing. Read again when a new question arrives.',
  'browserWatch.hint':
    'Watch this chat for known answers. Exact approved answers and unique completed summaries can select native choices automatically. Free text is only prefilled. Owner edits are preserved. Navigation, reload or an uncertain selection pauses the watcher; restarting the server never resumes it.',
  'browserWatch.minutes': 'Minutes (1–120)',
  'browserWatch.start': 'Watch this chat and answer known choices',
  'browserWatch.unconfirmed':
    'Watcher start is unconfirmed. Recover its saved status before starting another watcher.',
  'browserWatch.active': 'Watching this provider chat.',
  'browserWatch.paused':
    'Watcher paused. Review the provider chat before starting again.',
  'browserWatch.stopped': 'Watcher stopped; its pending action has settled.',
  'browserWatch.reason': 'Watcher detail: {code}',
  'browserWatch.recover': 'Recover watcher status',
  'browserWatch.stop': 'Stop watcher and wait',
  'browserWatch.phase.starting': 'Opening the reviewed chat.',
  'browserWatch.phase.waiting': 'Waiting for a new incoming question.',
  'browserWatch.phase.owner-draft': 'The owner’s draft is preserved.',
  'browserWatch.phase.pending-options':
    'Waiting for answer controls to appear or become enabled.',
  'browserWatch.phase.review': 'This question needs manual review.',
  'browserWatch.phase.ready': 'Preparing the known answer.',
  'browserWatch.phase.prefilled': 'The draft was prefilled for review.',
  'browserWatch.phase.sent': 'The provider confirmed the selected choice.',
  'browserWatch.phase.unknown':
    'The choice may have been sent. Resolve it in the outbox; automatic selection is paused.',
  'browserWatch.phase.failed': 'Selection was refused; the watcher is paused.',
  'browserWatch.phase.marked-sent':
    'You marked the earlier choice as sent in the outbox.',
  'browserWatch.selected': 'Last confirmed option: {option}',
  'browserWatch.phase.selecting':
    'Selecting the native choice; wait for its receipt.',
};
