export const enApplication = {
  'application.title': 'Native HH application review',
  'application.hint':
    'Review the full vacancy and native answers. Entering an application can send it immediately. Submission requires your confirmation; only a native success signal confirms delivery.',
  'application.settings': 'Application settings',
  'application.coverLetter': 'Reviewed cover letter (up to 24,000 characters)',
  'application.autoExact':
    'After filling, send automatically only when every answer is exact and verified',
  'application.delay': 'Review delay before automatic sending (0–30,000 ms)',
  'application.testMode':
    'Preview only: no answers or application actions are dispatched',
  'application.settingsHint':
    'These choices freeze when review starts. Recovery restores the server’s original choices. The letter is not saved in this browser. Existing native text is preserved.',
  'application.slot': 'Browser slot: {slot}',
  'application.automaticDelay':
    'Exact automatic sending is enabled with a {delay} ms review delay.',
  'application.refused':
    'The native action was refused. Read the page again before continuing.',
  'application.read': 'Read current native page',
  'application.enter': 'Enter application (may send immediately)',
  'application.prefill': 'Fill verified exact answers and letter',
  'application.prefillAutomatic':
    'Fill exact answers, then send after review delay',
  'application.submit': 'Send reviewed application',
  'application.close': 'Close owned application browser',
  'application.pause': 'Pause applications in this browser slot',
  'application.noQuestionnaires':
    'Defer questionnaires in this worker and browser slot',
  'application.sessionHint':
    'Pause and questionnaire choices carry across reviews in this worker and browser slot. Restart clears them and the deferred queue. Held forms stay open until you close them or stop the worker. Use Save answers and defer to back up a questionnaire before leaving it.',
  'application.unavailable':
    'A connected server with native application review support is required.',
  'application.choose': 'Collect or choose a saved vacancy to begin.',
  'application.bound':
    'This review remains bound to its original vacancy and browser slot. Close or finish it before reviewing the new selection.',
  'application.unknown':
    'Current status is unknown. Recover status before another action. Recovery only reads; it never repeats a send.',
  'application.missing':
    'The server confirmed there is no saved review for this vacancy and request.',
  'application.failed':
    'The application action or status could not be confirmed. Recover status before continuing.',
  'application.working': 'Working with the owned application browser…',
  'application.confirm':
    'I reviewed the full vacancy and authorize the labelled application action',
  'application.start': 'Open native review',
  'application.recover': 'Recover status (read only)',
  'application.reopen': 'Reopen browser from saved review',
  'application.release': 'Finish review and use current selection',
  'application.stop': 'Stop and drain application operation',
  'application.delivery.none': 'HH has not confirmed application delivery.',
  'application.delivery.unknown':
    'Delivery is unknown. A reserved action may have reached HH; it will not be sent again.',
  'application.delivery.provider-confirmed':
    'HH confirmed application delivery.',
  'application.letter.not-requested': 'No letter attachment requested yet.',
  'application.letter.verified': 'Letter verified in the native application.',
  'application.letter.not-attached': 'Letter is not attached.',
  'application.letter.unavailable': 'Letter control is unavailable.',
  'application.letter.unverified': 'Letter contents could not be verified.',
  'application.letter.owner-conflict':
    'Existing owner letter preserved; automatic sending is blocked.',
  'application.backup': 'Back up current native answers',
  'application.restore': 'Restore reviewed draft into empty controls',
  'application.draft': 'Private saved questionnaire draft',
  'application.draftSaved': 'Saved on this server at {time}',
  'application.draftHint':
    'Open the same native questions, including the letter control, before restoring. Review this private copy first. Existing answers are preserved; restoration never sends or learns answers. Backups are explicit and are not a retry queue.',
  'application.draft.checked': 'Checked',
  'application.draft.unchecked': 'Unchecked',
  'application.restore.restoring':
    'Restoration started; read the native page to confirm its current values.',
  'application.restore.restored':
    'Draft values verified in native controls. Review the answers before sending.',
  'application.restore.refused':
    'Restoration refused; existing answers are preserved. Read the page again.',
  'application.restore.partial':
    'Some draft values were restored. Read the native page before continuing.',
  'application.restore.uncertain':
    'Restoration could not be confirmed. Read the native page before another action.',
  'application.state.opening': 'Opening native review',
  'application.state.ready': 'Ready to enter the application',
  'application.state.review': 'Review native answers before sending',
  'application.state.verification':
    'Complete verification in the owned HH browser',
  'application.state.daily-limit': 'HH daily application limit reached',
  'application.state.external': 'External application requires manual review',
  'application.state.delivered': 'Application delivered',
  'application.state.wrong-page': 'Native page does not match this vacancy',
  'application.state.unavailable': 'Native application control unavailable',
  'application.state.interrupted':
    'Review interrupted; saved dispatch reservations retained',
  'application.state.sending': 'Native action dispatched; awaiting evidence',
  'application.state.review-delay': 'Review delay before automatic sending',
  'application.state.deferred': 'Questionnaire deferred in this review',
  'application.state.paused': 'Review paused',
  'application.state.test-preview':
    'Preview complete; no application action dispatched',
  'application.state.closed': 'Owned application browser closed',
  'application.defer': 'Save answers and defer',
  'application.queueTitle': 'Deferred questionnaires',
  'application.queueHint':
    'Save and defer keeps a private recovery copy and actual Q&A observations before closing. Eligible answers become unapproved knowledge. This queue lasts only in the current worker; reopening requires fresh review and does not restore or send answers. Separately saved exclusions still apply.',
  'application.queueRead': 'Refresh deferred queue',
  'application.queueLoading': 'Reading the current worker queue…',
  'application.queueUnknown':
    'The queue could not be read. No vacancy was reopened.',
  'application.queueEmpty': 'No questionnaires queued in this browser slot.',
  'application.retry': 'Reopen for fresh review',
};
