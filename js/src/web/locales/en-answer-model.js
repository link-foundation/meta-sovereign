export const enAnswerModel = {
  'answerModel.title': 'Optional Claude Code drafts',
  'answerModel.hint':
    'Runs Claude Code on this server using API/provider credentials available to the server. Selected CV, current profile, recent context and nearby approved answers are sent to that provider. Requires Claude Code and API/provider credentials; subscription login is not used. Tools and session persistence are disabled. Opt in for each plan; every model answer needs review. Nothing is sent to a chat or submitted to a form.',
  'answerModel.enable': 'Enable model drafts',
  'answerModel.model': 'Model alias or ID (empty uses the CLI default)',
  'answerModel.cv': 'Stored CV to include',
  'answerModel.noCv': 'Do not include a CV',
  'answerModel.cvMissing': 'unavailable',
  'answerModel.timeout': 'Request limit in milliseconds (1000–120000)',
  'answerModel.save': 'Save model settings',
  'answerModel.reload': 'Reload model settings',
  'answerModel.saved': 'Model settings saved.',
  'answerModel.changed':
    'Model settings changed elsewhere. Your draft is preserved; reload before saving.',
  'answerModel.error':
    'Model settings are unconfirmed ({code}). Reload to recover.',
  'answerModel.optIn':
    'Use configured model for unresolved answers in this plan',
  'answerModel.state.disabled': 'Model drafts are disabled.',
  'answerModel.state.unavailable':
    'Model drafts require the local server adapter.',
  'answerModel.state.unneeded':
    'Saved answers already cover this plan; the model was not called.',
  'answerModel.state.refused':
    'No model draft was accepted ({code}). Existing answers are preserved.',
  'answerModel.state.drafted':
    'Model drafts need review. Requested: {count}; outside this batch: {omitted}.',
  'answerModel.source': 'Model draft',
  'answerModel.clarification': 'Ask the owner to clarify missing facts.',
  'answerModel.review': 'Review the model draft before applying it.',
  'questions.match.model': 'Model draft',
  'forms.plan.source.model': 'Model draft',
  'forms.plan.reason.model-clarification':
    'Ask the owner to clarify missing facts.',
  'forms.plan.reason.model-review':
    'Review the model draft before applying it.',
};
