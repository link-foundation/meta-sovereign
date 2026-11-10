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
};
