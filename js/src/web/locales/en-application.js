export const enApplication = {
  'application.attention.waiting':
    'Complete HeadHunter verification in {slot} to continue.',
  'application.attention.notification':
    'A HeadHunter application needs your verification.',
  'application.applyFromVacancyPage':
    'Open the full form from the vacancy page',
  'application.routeHint':
    'When off, return through the original search before opening the full form. Full-form review avoids clicking Apply. With automatic CV language selection off, direct Apply entry uses the provider button. Stop, changed pages and existing drafts block route navigation.',
  'application.applicationSearchUrl':
    'Search URL for the return route (optional; blank uses the collected search or the HH search page)',
  'application.routeVacancy': 'Full-form review route: vacancy → full form.',
  'application.routeSearch':
    'Full-form review route: vacancy → original search → full form.',
  'application.vacancyPreviewSeconds':
    'Vacancy preview before entry (0–30 seconds)',
  'application.vacancyPreviewHint':
    'Before opening an application, scroll to the full vacancy description and show it for this long. Default: 3 seconds. Zero removes the pause. Sending filled answers has its own review delay.',
  'application.vacancyPreviewPolicy':
    'Vacancy preview before entry: {seconds} seconds.',
  'application.collectVacancies': 'Keep collected vacancy descriptions',
  'application.collectionHint':
    'When off, descriptions stay in memory for this run and are omitted from the application journal. They cannot be recovered after restart. Existing saved descriptions are kept.',
  'application.collectionEnabled': 'Vacancy collection: enabled',
  'application.collectionMemory':
    'Vacancy collection: off. Current descriptions stay in memory until the worker stops; restart cannot restore them.',
  'application.collectionPreview':
    'Preview: vacancy cache writes are suspended.',
  'application.state.vacancy-unavailable':
    'HH says this vacancy is unavailable to your account. Close the review; clear its recorded refusal only after access changes.',
  'application.hold.vacancy-unavailable': 'vacancy unavailable to this account',
  'application.salary.rates-stale':
    'Refresh the dated exchange rates before continuing.',
  'application.directForm':
    'Existing native application URL (optional; same vacancy)',
  'application.salaryPolicy': 'Check advertised pay before applications',
  'application.salaryFloor':
    'Current salary floor in RUB (blank uses the RUB net target)',
  'application.salaryPolicyHint':
    'Uses the shared targets above. Caps below half the independent target are excluded; lower offers wait for their tier. Unknown pay remains eligible. Copying discovery uses its acknowledged tier.',
  'application.salaryCurrentFloor':
    'Current salary floor: {amount} RUB equivalent',
  'application.salary.eligible-pay': 'Pay eligible',
  'application.salary.unknown-pay': 'Pay unspecified or unrecognized; eligible',
  'application.salary.below-half-target':
    'Advertised maximum is below half the target; application held',
  'application.salary.below-current-tier':
    'Pay is below the current tier; application deferred',
  'application.salary.missing-vacancy-context':
    'Collect the full vacancy before applying',

  'application.answerProfile': 'Shared answer profile: {profile}',
  'application.answerTargets': 'Fixed salary targets: {targets}',
  'application.answerContext':
    'Choose the shared answer profile and salary targets for this application or batch. Targets stay fixed for this review; each plan reads current saved profile values. Review assembled answers before sending.',
  'application.chats.enable': 'Review unread chats alongside applications',
  'application.chats.hint':
    'Uses a separate browser slot. A signed-out chat slot can reuse your active HeadHunter application sign-in. Choose bot options and send prepared drafts yourself while applications continue. Stop or completion closes the chat browser.',
  'application.chats.chatsIntervalMinutes':
    'Chat check interval in minutes (default 120)',
  'application.chats.chatBrowserSlot': 'Separate chat browser slot',
  'application.chats.status': 'Chats: {phase} · slot {slot}',
  'application.chats.held': 'Review in the chat browser: {title}',
  'application.chats.phase.starting': 'Starting',
  'application.chats.phase.running': 'Checking unread chats',
  'application.chats.phase.draining': 'Stopping and draining',
  'application.chats.phase.refused': 'Unavailable; read the error',
  'application.chats.phase.stopped': 'Stopped',
  'application.chats.phase.interrupted': 'Interrupted; explicit start required',
  'application.chats.phase.preview': 'Preview; chats unchanged',
  'application.autoAnswerViewedVacancy':
    'Answer the viewed-vacancy survey automatically',
  'application.feedbackHint':
    'During this review, select “Maybe I’ll apply later” in HH’s viewed-vacancy survey and close it. Keep a different reason you already selected. Preview mode makes no clicks.',
  'application.feedbackAutomatic':
    'Viewed-vacancy survey: “Maybe I’ll apply later” is enabled for this review.',
  'application.feedbackManual': 'Viewed-vacancy survey: answer manually.',
  'application.feedbackPreview':
    'Viewed-vacancy survey: preview makes no clicks.',
  'application.batch.settings':
    'Saved confirmations: {steps}. Interval: {interval}. Maximum deliveries: {maximum}.',
  'application.batch.title': 'Paced application batch',
  'application.batch.hint':
    'Start a finite list with the application settings above. The worker may fill and send when no selected confirmation is waiting. It revisits its RAM queue when questionnaires are enabled. Saved exclusions and uncertain outcomes stay protected. A backed daily-limit wait may refresh and restore its form, then follow the saved confirmations. Status and restart never resume a batch. Stop drains batch work and keeps the current form open.',
  'application.batch.urls': 'HH vacancy URLs (one per line; maximum 1,000)',
  'application.batch.maximum':
    'Maximum confirmed deliveries (0 = all listed vacancies)',
  'application.batch.duration': 'Run lifetime in seconds (up to 24 hours)',
  'application.batch.confirm':
    'I authorize this batch to continue and send according to the saved confirmation settings.',
  'application.batch.start': 'Start batch',
  'application.batch.status': 'Read batch status',
  'application.batch.stop': 'Stop batch; keep form',
  'application.batch.follow': 'Review current vacancy',
  'application.batch.progress':
    'Delivered: {delivered}; excluded: {skipped}; listed: {total}.',
  'application.batch.next': 'Next admission: {at}.',
  'application.batch.salaryDeferred': 'Temporary salary holds: {count}',
  'application.batch.phase.starting': 'Starting the owned batch.',
  'application.batch.phase.pacing': 'Waiting for the saved spacing deadline.',
  'application.batch.phase.review': 'Current vacancy needs review.',
  'application.batch.phase.questionnaires-held':
    'Questionnaires are held in this worker’s RAM queue.',
  'application.batch.phase.retry-wait':
    'Waiting for a backed generic-error retry.',
  'application.batch.phase.daily-limit':
    'Waiting for the saved HH daily pause. An owned wait may refresh and restore the form before the next configured confirmation.',
  'application.batch.phase.paused': 'Batch paused.',
  'application.batch.phase.completed': 'Batch completed.',
  'application.batch.phase.stopped':
    'Batch stopped; the current form remains open.',
  'application.batch.phase.expired':
    'Batch lifetime ended; the current form remains open.',
  'application.batch.phase.refused':
    'Batch refused further work. Review the current form.',
  'application.batch.phase.interrupted':
    'Worker interrupted. Reading this receipt does not restart it.',
  'application.confirmationSettings': 'Confirmation steps',
  'application.confirmation.answers': 'Answers',
  'application.confirmation.cover-letter': 'Cover letter',
  'application.confirmation.send': 'Questionnaire Send',
  'application.confirmation.popup': 'Short popup',
  'application.confirmation.none': 'No confirmation pauses',
  'application.continue': 'Continue with saved settings',
  'application.confirmStep': 'Confirm: {step}',
  'application.savedConfirmations': 'Saved confirmation steps: {steps}.',
  'application.continueHint':
    'Continue fills only exact saved answers into empty controls and may send when no selected step is waiting. Each selected step requires separate current confirmation. Missing answers wait for you. Supervised review requires every step; preview changes nothing. Reading or restarting never continues.',
  'application.continuation.answers':
    'Review the proposed answers, then confirm their fill.',
  'application.continuation.cover-letter':
    'Review the chosen cover letter, then confirm attachment.',
  'application.continuation.send':
    'Review the native questionnaire, then confirm Send.',
  'application.continuation.popup':
    'Review the short native popup, then confirm continuation.',
  'application.continuation.missing-answers':
    'Complete missing answers in HH, read the form and continue. No application was sent.',
  'application.continuation.complete': 'HH confirmed delivery.',

  'application.dailyRejection.recorded':
    'The issued application has a saved native daily-limit rejection. Waiting with restoration verifies this evidence before releasing only that failed reservation. Sending needs a separate confirmation.',
  'application.dailyRejection.released':
    'The rejected reservation was released after the verified refresh. Restoration is checked separately; sending still needs confirmation.',
  'application.limitWaitRestore': 'Wait, refresh and restore saved answers',
  'application.limitWaitRestorePolicy':
    'After one guarded refresh, restore saved answers into matching empty controls. Sending still needs its own confirmation.',
  'application.limitWait.restoring':
    'Restoring saved answers into the refreshed form…',
  'application.limitWaitStart': 'Wait, then review a refreshed form',
  'application.limitWaitStop': 'Stop waiting; keep this form',
  'application.limitWaitHint':
    'Waiting saves later edits and releases the workspace between checks. At the saved deadline, only a still-failed unchanged form is refreshed. Choose whether to confirm restoration now or later. Sending needs its own confirmation; unknown delivery stays reserved. Stop keeps the form open. Restart never resumes waiting.',
  'application.limitWait.waiting': 'Waiting for the saved deadline.',
  'application.limitWait.refreshing': 'Refreshing the verified failed form…',
  'application.limitWait.review':
    'Waiting ended. Review the current form; restore saved answers separately if needed.',
  'application.limitWait.stopped':
    'Waiting stopped. The current form remains open.',
  'application.limitWait.refused':
    'Waiting could not safely continue. Read the current form before trying again.',
  'application.limitDraftSaved':
    'These actual answers and letter were saved during the daily pause. Restoration needs confirmation, either with the wait-and-restore action or after reopening. Restoration never sends the application.',
  'application.resumePreferenceSource.automatic': 'automatic language choice',
  'application.autoSelectResumeLanguage':
    'Select the résumé language automatically before applying',
  'application.languagePolicyHint':
    'Entry first opens the full form for review. Checked exports must establish the CV language. Explicit choices and later changes in HH override automatic selection, including after restart.',
  'application.languageAutomatic':
    'Automatic résumé language is enabled; entry opens the review form without applying.',
  'application.languageManual':
    'Automatic résumé selection is off for this saved review.',
  'application.standardLetters':
    'Use reviewed English and Russian standard letters',
  'application.standardLetter.en': 'English standard letter (required)',
  'application.standardLetter.ru': 'Russian standard letter (required)',
  'application.standardLettersHint':
    'Both variants are required. The letter follows the verified selected CV language. A corrected decision replaces only unchanged standard text after a confirmed letter fill. Owner edits and answers are preserved.',
  'application.resumePreference': 'Saved résumé choice: {title} ({source}).',
  'application.resumePreferenceSource.manual': 'explicit choice',
  'application.resumePreferenceSource.context': 'employer-context choice',
  'application.resumePreferenceSource.native': 'changed in the native form',
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
    'Review the full vacancy and native answers. Entering an application can send it immediately. Continue follows the saved confirmation choices; only a native success signal confirms delivery.',
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
  'application.enterWithLanguage': 'Open full form and check CV language',
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
  'application.state.resume-not-visible':
    'HH requires a résumé visible to all employers. Change its visibility in HH before reviewing again.',
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
  'application.hold.resume-not-visible': 'résumé visibility warning',
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
  'application.limitWaiting': 'HH applications are paused until {at}.',
  'application.limitElapsed':
    'The saved HH application pause ended at {at}. Read the current form before continuing.',
  'application.limitScope':
    'This pause covers every HH application slot in this workspace. The current refused form stays open; reading and chats can continue. A native hold and any unconfirmed delivery reservation still require separate review.',
  'application.limitUnsaved':
    'This pause is held in memory. Saving failed, so restart recovery is not verified. Keep this worker and form open and read again to retry saving.',
  'application.pacingEnabled': 'Space new application reviews',
  'application.pacingInterval': 'Interval in seconds (0: adaptive)',
  'application.pacingHint':
    'Optional spacing starts at two minutes and adapts within 1–4 minutes after native HH delivery or CAPTCHA observations. Positive seconds use a fixed interval, up to 86400. Time spent reviewing counts. This workspace schedule survives restarts and applies across slots. Read the queue after the deadline; expiry does not open or send anything.',
  'application.pacingWaiting':
    'New vacancy reviews wait until {at}. Read the queue to refresh eligibility.',
  'application.pacingReady':
    'The saved review interval ended at {at}. Starting a review still requires an explicit action.',
  'application.pacingStats':
    '{mode}: {seconds} seconds. Observed deliveries: {deliveries}; CAPTCHAs: {challenges}.',
  'application.pacingMode.adaptive': 'Adaptive',
  'application.pacingMode.fixed': 'Fixed',
  'application.pacingHold':
    'Successful delivery cannot speed up the adaptive pace before {at}.',
  'application.pacingUnsaved':
    'This schedule has not been acknowledged by storage. Keep this worker open; new review admission remains blocked until it can save.',
};
