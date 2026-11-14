export const enApplication = {
  'application.form': 'Open full form for review',
  'application.resumeContext': 'Context suggests {language}: {reason}.',
  'application.resumeContextUnknown':
    'The employer text does not establish a résumé language. Choose explicitly after review.',
  'application.resumeContextChoose': 'Choose résumé from employer context',
  'application.resumeReason.dollar-pay': 'dollar-denominated pay',
  'application.resumeReason.questions': 'employer questions',
  'application.resumeReason.description': 'full vacancy description',
  'application.resumeReason.title': 'vacancy title',
  'application.resume': 'Application résumé',
  'application.resumeHint':
    'Open the native choices, then confirm a résumé by its hash. A matching checked export is required. Answers, letters and sending keep separate actions.',
  'application.resumeUnavailable':
    'The native chooser is ambiguous or unsupported. Read the page again or choose directly in HH.',
  'application.resumeOpen': 'Open native résumé choices',
  'application.resumeClose': 'Close native résumé choices',
  'application.resumeChoose': 'Choose {title} · {hash}',
  'application.resumeVerified':
    'Verified {language} export used for choice {hash}.',
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
    'Pause and questionnaire choices carry across reviews in this worker and browser slot. Deferring questionnaires automatically saves actual answers and closes them after every save succeeds. Failed saves, paused forms and preview stay open. Re-enable questionnaires here before a confirmed queue review. Restart clears these choices and the queue.',
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
    'Delivery is unknown. A reserved action may have reached HH. A retry requires fresh native rejection evidence and a separately confirmed review.',
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
    'Open the same native questions, including the letter control, before restoring. Review this private copy first. Existing answers are preserved; restoration never sends or learns answers. A saved copy alone is not a retry queue.',
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
  'application.state.provider-error':
    'HH application error: manual action required',
  'application.hold':
    'Automatic sending and automatic questionnaire deferral are held: {reason}. Dismissing the banner does not grant sending permission. Read the page before a separately confirmed send; confirmed delivery clears the hold. A backed generic-error queue allows fresh review only after its five-hour wait.',
  'application.hold.generic-error': 'generic provider error',
  'application.hold.validation-error': 'provider validation error',
  'application.hold.verification': 'manual verification',
  'application.hold.daily-limit': 'provider application limit',
  'application.hold.external': 'external application',
  'application.defer': 'Save answers and defer',
  'application.queueTitle': 'Deferred applications',
  'application.queueHint':
    'Save and defer keeps a private recovery copy and actual Q&A observations before closing. Eligible answers become unapproved knowledge. This queue lasts only in the current worker; reopening requires fresh review and does not restore or send answers. Separately saved exclusions still apply.',
  'application.queueRead': 'Refresh deferred queue',
  'application.queueLoading': 'Reading the current worker queue…',
  'application.queueUnknown':
    'The queue could not be read. No vacancy was reopened.',
  'application.queueEmpty': 'No applications queued in this browser slot.',
  'application.retry': 'Reopen for fresh review',
  'application.retryWaiting':
    'Answers saved. Generic-error retry available at {at} (five-hour wait).',
  'application.retryReady':
    'The generic-error wait has ended. Reopen for fresh review; restoration and sending need separate confirmation.',
  'application.supervised': 'Review one application step by step',
  'application.supervisedHint':
    'Answers, letter and sending need separate confirmation. Automatic sending is off. Entry can still send immediately if HH offers no review form.',
  'application.answers': 'Fill reviewed exact answers only',
  'application.letter': 'Attach reviewed letter only',
  'application.reenter': 'Reopen reviewed popup (may send immediately)',
  'application.reenterHint':
    'An unsent native popup was saved before this browser was reopened. Opening it again needs a new confirmation and can apply immediately. It does not restore answers or send a saved draft.',
};
