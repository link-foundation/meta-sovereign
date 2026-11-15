import { contextualReplyLocale } from './contextual-replies.js';
export const enGratitude = {
  ...contextualReplyLocale('en'),
  'automations.presets.gratitude.name': 'Reply to gratitude',
  'automations.presets.gratitude.description':
    'Review a reply to a personal VK gratitude message or sticker; choose stickers or your formal and informal texts.',
  'questions.kind.reply-gratitude': 'Reply to gratitude',
  'gratitude.recognizer': 'Incoming recognition',
  'gratitude.recognizer.pattern': 'Your regular expression',
  'gratitude.recognizer.gratitude': 'Gratitude phrases and VK stickers',
  'gratitude.hint':
    'Only an unanswered personal VK gratitude message qualifies. Scheduled and incoming runs prepare drafts for review.',
  'gratitude.preferSticker': 'Reply with a VK sticker',
  'gratitude.stickers': 'Response sticker IDs',
  'gratitude.stickersHint':
    'Comma-separated VK IDs. Disable sticker replies to use the text variants below. API access and the sticker pack are required.',
  'gratitude.preview': 'VK sticker {id}',
  'gratitude.editHint':
    'Enter text to send it instead of this sticker. Changing the address form also selects your text variant.',
  'automations.reason.gratitude-incoming-required':
    'The latest message must be incoming gratitude.',
  'automations.reason.gratitude-message-required':
    'The complete message is not recognized as gratitude.',
  'automations.presets.identity.name': 'Reply to identity questions',
  'automations.presets.identity.description':
    'Review your formal or informal reply to a personal VK “who are you?” question. Its address form is learned from incoming history.',
  'gratitude.recognizer.identity': 'Identity question: who are you?',
  'automations.reason.identity-incoming-required':
    'The latest message must be an incoming personal VK identity question.',
  'automations.reason.identity-question-required':
    'The complete message is not recognized as an identity question.',
  'chat.about.identity': 'addressed you in an identity question {when}',
  'questions.kind.reply-identity': 'Reply to identity questions',
  'automations.presets.acquaintance.name': 'Reply to acquaintance questions',
  'automations.presets.acquaintance.description':
    'Review your introduction when a personal VK contact asks whether you know each other. Reply at most once a day by default.',
  'gratitude.recognizer.acquaintance':
    'Acquaintance question: do we know each other?',
  'automations.reason.acquaintance-incoming-required':
    'The latest message must be an incoming personal VK acquaintance question.',
  'automations.reason.acquaintance-question-required':
    'The complete message is not recognized as an acquaintance question.',
  'questions.kind.reply-acquaintance': 'Reply to acquaintance questions',
  'acquaintance.catalogHint':
    'Separate alternatives with a blank line; up to 32 per form, 4096 characters each. A reply is selected consistently for each incoming message. Leave a list empty to use the ordinary text variant below.',
  'acquaintance.alternativeInformal': 'Alternative replies (informal)',
  'acquaintance.alternativeFormal': 'Alternative replies (formal)',
};
