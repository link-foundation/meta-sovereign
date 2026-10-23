// Voice and video note transcription and reporting messages (R-Y175),
// split from ./en-chat.js to keep each file small; its keys are
// part of the en dictionary.

export const enTranscribe = {
  'chat.transcribe.button': 'Transcribe to text',
  'chat.transcribe.empty': 'Nothing was recognised.',
  'chat.transcribe.pending': 'Still transcribing',
  'chat.transcribe.trial': '{count} free transcriptions left',
  'chat.transcribe.trialNone': 'No free transcriptions left.',
  'chat.transcribe.cooldown':
    'No free transcriptions left. The next one is free after {date}.',
  'chat.transcribe.good': 'Good transcription',
  'chat.transcribe.bad': 'Poor transcription',
  'chat.transcribe.err.premium':
    'Transcription needs Telegram Premium, or a free trial.',
  'chat.transcribe.err.transcription-failed':
    'Telegram could not transcribe this message.',
  'chat.transcribe.err.not-found': 'This message is no longer there.',
  'chat.transcribe.err.no-access': 'This chat is not available.',
  'chat.transcribe.err.flood': 'Too many tries. Wait a while and try again.',
  'chat.transcribe.err.failed': 'Something went wrong. Try again.',
  'chat.selection.report': 'Report',
};
