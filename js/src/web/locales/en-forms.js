export const enForms = {
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
};
