import { enAssignment } from './en-assignment.js';
export const enForms = {
  ...enAssignment,
  'forms.assignment.title': 'Test assignment repository',
  'forms.assignment.needs-repository':
    'Create the assignment repository before prefilling any answers or attaching files.',
  'forms.assignment.verified':
    'Repository existence was verified. Plan the current page again to use its link.',
  'forms.assignment.hint':
    'If the repository already exists, enter its GitHub URL and verify it. The link is saved privately for this form and assignment.',
  'forms.assignment.scope':
    'This check confirms repository existence. Review the assignment and its implementation yourself. A changed task requires a new link verification.',
  'forms.assignment.repository': 'GitHub repository URL',
  'forms.assignment.link': 'Verify and save repository link',
  'forms.assignment.checking': 'Checking repository…',
  'forms.assignment.error':
    'The repository link was not confirmed ({code}). Your input is retained; plan again if the assignment changed.',
  'forms.plan.source.assignment': 'Verified assignment repository',
  'forms.plan.reason.assignment-required':
    'Prefilling waits for the assignment repository.',
  'forms.automatic.action': 'Prefill empty fields',
  'forms.automatic.recover': 'Recover prefill result',
  'forms.automatic.hint':
    'Fill complete supported answers in empty controls and attach the saved PDF, if configured. The site may upload or save changes immediately. Existing answers stay unchanged. Review every answer; open Next and submit yourself.',
  'forms.automatic.error':
    'No confirmed result ({code}). Inspect the browser or recover the same request; recovery keeps the original settings.',
  'forms.automatic.title': 'Automatic prefill result',
  'forms.automatic.unresolved':
    'Questions still needing review or an answer: {count}.',
  'forms.automatic.next':
    'Review the current answers, open Next yourself, then prefill the new page. Submit the form yourself when finished.',
  'forms.automatic.review':
    'Review the current answers and complete open questions. Submit the form yourself when finished.',
  'forms.reason.owner-verification':
    'Manual verification is visible. Complete it in the review browser; its contents are excluded from answers.',
  'forms.reason.captcha-frame':
    'A CAPTCHA frame was excluded from answer inspection.',
  'forms.automatic.state.waiting-owner':
    'Waiting for you to solve verification in the review browser.',
  'forms.automatic.state.prefilling':
    'Verification cleared. Checking the form before filling.',
  'forms.automatic.wait':
    'Solve the CAPTCHA yourself before {time}. Use Focus to open a visible review window, or Close to cancel. Challenge contents are excluded from answer learning.',
  'forms.automatic.state.prefilled':
    'Supported empty fields were filled and verified. Review the current form.',
  'forms.automatic.state.partial':
    'Some fields remain open or could not be confirmed. Review the current form.',
  'forms.automatic.state.uncertain':
    'An attempted change is uncertain. Inspect the current form before another request.',
  'forms.automatic.state.refused':
    'The prefill sequence was refused. Inspect confirmed changes and read the current page again.',
  'forms.journal.action.prefill': 'Prefill empty fields',
  'forms.capacity.label': 'Maximum review browsers controlled here',
  'forms.capacity.hint':
    'Saved in this store. Four per controller by default; choose a capacity that fits this server. Detached watchers are listed separately. Increasing capacity does not launch browsers.',
  'forms.capacity.save': 'Save browser capacity',
  'forms.review.error.form-capacity-invalid':
    'Use a positive whole number for browser capacity.',
  'forms.review.error.form-capacity-changed':
    'Browser capacity changed. Refresh sessions before saving again.',
  'forms.review.error.form-capacity-in-use':
    'Close review browsers before reducing capacity below the number currently owned.',
  'forms.review.error.form-capacity-unavailable':
    'Browser capacity could not be saved in this store.',

  'forms.resume.title': 'Saved PDF résumé',
  'forms.resume.hint':
    'Save one PDF in your private store for reuse. Each form still requires an explicit attachment; saving does not upload it to a form.',
  'forms.resume.loading': 'Loading saved PDF…',
  'forms.resume.saved': '{name} · {size} bytes',
  'forms.resume.empty': 'No PDF is saved.',
  'forms.resume.save': 'Save selected PDF',
  'forms.resume.delete': 'Forget saved PDF',
  'forms.resume.reload': 'Reload saved PDF',
  'forms.resume.changed':
    'The saved PDF changed. Reload it and review a new plan.',
  'forms.resume.error':
    'Could not update the saved PDF ({code}). Reload before retrying.',
  'forms.resume.attach': 'Attach saved PDF: {name} · {size} bytes',
  'forms.resume.unknown': 'Saved PDF status is unavailable.',

  'forms.learning.observed':
    'Actual answers considered (including skipped answers)',
  'forms.learning.enable': 'Learn answers from planned pages',
  'forms.learning.scope':
    'After planning each page, save reusable answers as unapproved proposals after observed submission completion or an owner edit stays unchanged for one minute. Unchanged prefills are not learned before submission. Turning off capture also turns off learning.',
  'forms.learning.waiting-plan':
    'Learning is ready. Plan this page to select the questions to watch.',
  'forms.learning.watching':
    'Learning is on · {tracked} tracked answers · {saved} proposals saved · {skipped} skipped · {omitted} omitted · {failed} failures.',
  'forms.learning.disabled': 'Answer learning is off.',
  'forms.learning.incomplete':
    'Learning paused because capture was incomplete. Plan the current page again; earlier uncaptured answers cannot be learned.',
  'forms.learning.failed':
    'Learning paused after repeated failures. Review the stored answers and plan again to retry.',
  'forms.learning.stopped': 'Answer learning stopped.',
  'forms.learning.result':
    '{kind}: {saved} unapproved proposals saved · {skipped} skipped.',
  'forms.learning.kind.observed-submission': 'Observed submission completion',
  'forms.learning.kind.stable-owner-edit': 'Owner edit stable for one minute',
  'forms.journal.action.learn': 'Learn answers',

  'forms.monitor.capture': 'Capture pages automatically',
  'forms.monitor.scope':
    'Capture visible questions and current values while you edit or open later pages. This does not confirm submission or learn answers.',
  'forms.monitor.active':
    '{captured} automatic captures · {omitted} omitted · {failed} failures.',
  'forms.monitor.disabled':
    'Automatic capture is off. Read each page to keep a checkpoint.',
  'forms.monitor.unavailable':
    'Automatic capture is unavailable. Read each page to keep a checkpoint.',
  'forms.monitor.stopped': 'Automatic capture stopped.',
  'forms.navigation.next':
    'A Next control is visible. Open the next page in the review browser, then read and plan its current questions.',
  'forms.reason.other-documents-not-sampled':
    'This automatic checkpoint covers one document; other frames were not read at the same instant.',
  'forms.journal.action.observe': 'Automatic capture',
  'forms.journal.previous':
    'The page could not be read after this action. This checkpoint shows the last reviewed snapshot, not a confirmed current value.',
  'forms.downloadMarkdown': 'Download Markdown',
  'forms.reportSaved': 'Markdown report saved: {path}',
  'forms.reportFailed':
    'The Markdown report could not be saved. Download a copy to keep this report.',
  'forms.review.history': 'Captured pages',
  'forms.journal.title': 'Captured form pages',
  'forms.journal.scope':
    'These are explicit reads, plans, verified actions and enabled automatic captures in this open session. Pages or edits between captures may be missing. The bounded journal lasts until this session closes; exported reports remain saved. Captures do not prove submission or learning.',
  'forms.journal.count':
    '{count} retained checkpoints · {omitted} omitted by retention limits',
  'forms.journal.entry': '{action} · {fields} fields · {time}',
  'forms.journal.inspect': 'Show snapshot',
  'forms.journal.action.read': 'Read',
  'forms.journal.action.plan': 'Plan',
  'forms.journal.action.apply': 'Apply',
  'forms.journal.action.attach': 'Attach PDF',
  'forms.journal.action.disclose': 'Inspect choices',
  'forms.fill.unavailable':
    'Review this field in the form browser; no change is available here.',
  'forms.fill.radioChanges': 'This option also clears: {fields}.',
  'forms.fill.radioReceipt': '{field} → Not selected: {status}',
  'nav.forms': 'Forms',
  'forms.title': 'Form inspection',
  'forms.hint':
    'Read visible questions and current values in an isolated browser slot. Inspection leaves answers unchanged and closes its browser when finished.',
  'forms.loading': 'Checking browser availability…',
  'forms.unavailable':
    'Connect a server with browser automation to inspect a form.',
  'forms.retry': 'Check again',
  'forms.url': 'Form URL',
  'forms.slot': 'Browser slot',
  'forms.slotHint':
    'A named slot keeps its own sign-in profile. Browser visibility follows your Forms and slot settings.',
  'forms.read': 'Read current page',
  'forms.reading': 'Reading…',
  'forms.report': 'Inspection report',
  'forms.count': '{fields} fields read across {frames} documents.',
  'forms.scope':
    'This snapshot covers visible controls on the current pages. Later pages and closed custom controls may contain other questions. Report row IDs apply only to this snapshot.',
  'forms.partial': 'Some content could not be inspected:',
  'forms.download': 'Download report',
  'forms.empty':
    'No visible form fields were found. Check the page in your browser, including sign-in and CAPTCHA requirements.',
  'forms.unlabelled': 'Unlabelled field',
  'forms.group': 'Question group: {label}',
  'forms.source': 'Label: {source} · {type} · {frame}',
  'forms.required': 'Required',
  'forms.disabled': 'Disabled',
  'forms.readOnly': 'Read only',
  'forms.value': 'Current value: {value}',
  'forms.mixed': 'Mixed selection',
  'forms.checked': 'Selected',
  'forms.unchecked': 'Not selected',
  'forms.omitted': 'The {type} field’s contents were not read.',
  'forms.label.aria-labelledby': 'referenced accessible text',
  'forms.label.aria-label': 'accessible label',
  'forms.label.label': 'form label',
  'forms.label.placeholder': 'placeholder',
  'forms.label.title': 'title',
  'forms.label.legend': 'group legend',
  'forms.label.heading': 'preceding heading',
  'forms.label.unlabelled': 'no label found',
  'forms.reason.unlabelled-controls':
    'Some controls had no readable question label.',
  'forms.reason.text-limit':
    'Some labels or descriptions exceeded the text limit.',
  'forms.reason.value-limit': 'Some existing values exceeded the text limit.',
  'forms.reason.control-scan-limit': 'The control scan reached its limit.',
  'forms.reason.field-limit': 'The field limit was reached.',
  'forms.reason.option-limit': 'Some choice options exceeded the limit.',
  'forms.reason.unexpanded-options':
    'A custom choice control was closed; its options were not opened.',
  'forms.reason.shadow-scan-limit':
    'Custom-element inspection reached its limit.',
  'forms.reason.custom-elements':
    'Custom or shadow-root elements may contain unread controls.',
  'forms.reason.frame-limit': 'The frame limit was reached.',
  'forms.reason.parent-frame-unavailable': 'A parent frame was unavailable.',
  'forms.reason.hidden-frame': 'A hidden frame was left unread.',
  'forms.reason.frame-unavailable': 'A frame could not be read.',
  'forms.error.form-url':
    'Enter an HTTP or HTTPS URL without embedded credentials.',
  'forms.error.form-busy':
    'Another inspection is running. Wait for it to finish, then try again.',
  'forms.error.form-changed':
    'The form changed pages during inspection. Read its current page again.',
  'forms.error.form-timeout':
    'Inspection reached its time limit. Check the page, then try again.',
  'forms.error.form-stopped':
    'Inspection stopped before a snapshot was completed. Try again on an available server.',
  'forms.error.browser-unavailable':
    'Browser automation is unavailable on this server. Check its browser setup.',
  'forms.error.bad-browser-policy':
    'Use a slot name containing lowercase letters, numbers, hyphens or underscores.',
  'forms.error.server-required':
    'Connect a server with browser automation to read this form.',
  'forms.error.form-read-failed':
    'The form could not be read. Your URL and last report are kept; check the page and try again.',
  'forms.plan.title': 'Answer proposals',
  'forms.plan.hint':
    'Use saved answers and an optional owner profile to prepare a proposal for each field.',
  'forms.plan.reloadProfiles': 'Reload profiles',
  'forms.plan.profile': 'Owner profile',
  'forms.plan.savedOnly': 'Saved answers only',
  'forms.plan.profilesLoading': 'Loading profiles…',
  'forms.plan.profilesFailed':
    'Profiles could not be loaded. Saved answers remain available.',
  'forms.plan.approximate': 'Include similar saved questions for review',
  'forms.plan.action': 'Plan answers',
  'forms.plan.planning': 'Planning…',
  'forms.plan.proposal': 'Proposed: {value}',
  'forms.plan.unresolved': 'Needs an answer',
  'forms.plan.source': 'Answer source: {source}',
  'forms.plan.similarity': 'Question similarity: {percent}%',
  'forms.plan.missing': 'Missing profile values: {keys}',
  'forms.plan.keys': 'Profile values used: {keys}',
  'forms.plan.rule': 'Saved question: {question}',
  'forms.plan.evidence': 'Evidence: {source}',
  'forms.plan.count':
    '{proposed} proposals · {unresolved} unresolved · {preserved} existing values preserved',
  'forms.plan.review':
    'Review every proposal. Planning leaves the form unchanged and does not submit or learn answers.',
  'forms.plan.profileSource': 'Profile: {name} · revision {revision}',
  'forms.plan.modelUnavailable':
    'Model suggestions are unavailable in this planner.',
  'forms.plan.source.profile': 'Owner profile',
  'forms.plan.source.exact': 'Exact saved question',
  'forms.plan.source.template': 'Saved question template',
  'forms.plan.source.approximate': 'Similar saved question',
  'forms.plan.source.salary': 'Salary settings',
  'forms.plan.source.assembled': 'Combined saved answers',
  'forms.plan.source.unresolved': 'No usable answer',
  'forms.plan.reason.protected-field':
    'This field is protected or has a mixed state; no change is proposed.',
  'forms.plan.reason.missing-label':
    'Read a clear question label before proposing an answer.',
  'forms.plan.reason.missing-profile': 'Required profile values are missing.',
  'forms.plan.reason.choice-mismatch':
    'The answer does not identify exactly one available choice.',
  'forms.plan.reason.field-format':
    'The answer needs review for this field’s format or choices.',
  'forms.plan.reason.no-answer': 'No usable saved answer was found.',
  'forms.plan.reason.current-value':
    'The current value is preserved. Compare it with the proposal.',
  'forms.plan.reason.review': 'Review this proposal before making any change.',
  'forms.plan.reason.planning-limit':
    'The matching limit was reached. This field remains unresolved.',
  'forms.plan.error.form-report':
    'Read the current form again to obtain a valid inspection report.',
  'forms.plan.error.answer-profile-missing':
    'The selected profile is missing. Reload profiles and choose another.',
  'forms.plan.error.form-stopped':
    'Planning stopped. Retry on an available server.',
  'forms.plan.error.server-required': 'Connect a server to plan these answers.',
  'forms.plan.error.form-plan-failed':
    'Answers could not be planned. Your inspection, choices and last plan are kept; retry when ready.',
  'forms.review.title': 'Review browsers',
  'forms.review.hint':
    'Keep a browser open on the server for review. Handle sign-in, CAPTCHA and later pages in that browser, then read its current page. Review sessions close after 24 hours without activity or when the server stops. These controls leave answers unchanged and never submit.',
  'forms.review.open': 'Open for review',
  'forms.review.opening': 'Opening…',
  'forms.review.refresh': 'Refresh sessions',
  'forms.review.loading': 'Loading review sessions…',
  'forms.review.count': '{count} of {limit} review sessions open',
  'forms.review.read': 'Read current page',
  'forms.review.focus': 'Show browser',
  'forms.review.close': 'Close browser',
  'forms.review.headless':
    'Browser runs without a visible window. Change Forms visibility settings before opening a new session.',
  'forms.review.headed': 'Visible browser on the server',
  'forms.review.visibilityPending': 'Checking browser visibility…',
  'forms.review.expires': 'Closes if unused until {time}',
  'forms.review.state.opening': 'Opening',
  'forms.review.state.open': 'Open for review',
  'forms.review.state.closing': 'Closing',
  'forms.review.state.close-failed': 'Close not confirmed',
  'forms.review.error.form-slot-in-use':
    'That review slot is already open. Use its controls or choose another slot.',
  'forms.review.error.form-session-limit':
    'Close a review browser before opening another.',
  'forms.review.error.form-session-missing':
    'This review session is no longer available. Refresh the list.',
  'forms.review.error.form-session-closed':
    'The browser closed. Open a new review session.',
  'forms.review.error.form-close-failed':
    'Browser cleanup was not confirmed. Keep this session in the list and retry closing it.',
  'forms.review.error.form-focus-unavailable':
    'This browser cannot show a review window.',
  'forms.review.error.form-busy':
    'Another review operation is running. Wait for it to finish.',
  'forms.review.error.form-timeout':
    'Review reached its time limit. Refresh sessions and retry when ready.',
  'forms.review.error.form-stopped':
    'Review is stopping. Connect an available server.',
  'forms.review.error.server-required':
    'Connect a server to manage review browsers.',
  'forms.review.error.form-review-failed':
    'The review operation could not be confirmed. Your URL and report are kept. Refresh sessions before trying again.',
  'forms.fill.title': 'Review selected changes',
  'forms.choices.inspect': 'Open choices for inspection',
  'forms.choices.opened':
    'Choices are open and inspected. Create a new answer plan for this page before applying changes.',
  'forms.choices.uncertain':
    'The choice inspection could not be confirmed. Inspect the browser and create a new plan before making changes. {code}',
  'forms.choices.refused':
    'Choice inspection was refused before clicking. Create a new plan for the current page. {code}',
  'forms.fill.hint':
    'Select fields below, then apply only those proposals. Text fields, native controls and exposed ARIA checkboxes, complete radio groups and single choices are supported. Existing answers require explicit replacement. Submit and Next are left to you; sites may save changes as you edit.',
  'forms.fill.select': 'Apply this proposal',
  'forms.fill.count': '{count} selected · maximum {limit}',
  'forms.fill.replace':
    'Allow replacing existing answers affected by selected changes',
  'forms.fill.existing':
    'An existing answer would change. Review the selected changes, then allow replacement or deselect the field.',
  'forms.fill.apply': 'Apply selected changes',
  'forms.fill.error':
    'No confirmed result ({code}). Your selection is kept. Retry the same plan to recover its receipt; an existing application will not run again.',
  'forms.fill.state.applied':
    'All selected changes were confirmed. Review the form in its browser before sending it.',
  'forms.fill.state.partial':
    'Some selected changes were confirmed. Review the current page and create a new plan for remaining fields.',
  'forms.fill.state.uncertain':
    'The result of an attempted change is uncertain. Inspect the browser and current report before planning again.',
  'forms.fill.state.refused':
    'Changes were refused before a field was changed. Read the current page and create a new plan.',
  'forms.fill.refusal': 'Reason: {code}',
  'forms.fill.receipt': '{field}: {status}',
  'forms.fill.receipt.applied': 'Applied and read back',
  'forms.fill.receipt.unchanged': 'Already matched; unchanged',
  'forms.fill.receipt.uncertain': 'Result uncertain',
  'forms.fill.receipt.not-attempted': 'Not attempted',
  'forms.upload.hint':
    'Choose the PDF résumé to attach to this field (maximum 8 MiB). The site may upload it immediately. Review the form before sending; a fresh answer plan is required after attachment.',
  'forms.upload.choose': 'PDF résumé',
  'forms.upload.selected': 'Selected: {name} · {size} bytes',
  'forms.upload.replace': 'Allow replacing the currently attached file',
  'forms.upload.attach': 'Attach selected PDF',
  'forms.upload.attached':
    '{name} was attached and its contents verified. Review a fresh plan before making other changes.',
  'forms.upload.uncertain':
    'Attachment could not be confirmed ({code}). Check the actual form before trying again.',
  'forms.upload.refused':
    'No attachment was issued ({code}). Plan the current page again.',
};
