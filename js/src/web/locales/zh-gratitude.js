import { contextualReplyLocale } from './contextual-replies.js';
export const zhGratitude = {
  ...contextualReplyLocale('zh'),
  'automations.presets.gratitude.name': '回复感谢',
  'automations.presets.gratitude.description':
    '审核 VK 私人对话中的感谢消息或贴纸回复；可选择贴纸或自定义正式与非正式文本。',
  'questions.kind.reply-gratitude': '回复感谢',
  'gratitude.recognizer': '接收消息识别',
  'gratitude.recognizer.pattern': '自定义正则表达式',
  'gratitude.recognizer.gratitude': '感谢语句和 VK 贴纸',
  'gratitude.hint':
    '仅处理 VK 私人对话中尚未回复的感谢消息。接收消息与定时任务会生成待审核草稿。',
  'gratitude.preferSticker': '使用 VK 贴纸回复',
  'gratitude.stickers': '回复贴纸 ID',
  'gratitude.stickersHint':
    '以逗号分隔 VK ID。关闭贴纸回复可使用下方文本。需要 API 权限及贴纸包。',
  'gratitude.preview': 'VK 贴纸 {id}',
  'gratitude.editHint':
    '输入文本后将发送文本而非此贴纸。切换称呼形式也会选择相应文本。',
  'automations.reason.gratitude-incoming-required':
    '最新消息必须是收到的感谢消息。',
  'automations.reason.gratitude-message-required': '完整消息未被识别为感谢。',
  'automations.presets.identity.name': '回复身份问题',
  'automations.presets.identity.description':
    '审核 VK 私聊中“你是谁？”的正式或非正式回复。称呼偏好从收到的历史消息中学习。',
  'gratitude.recognizer.identity': '身份问题：你是谁？',
  'automations.reason.identity-incoming-required':
    '最新消息必须是收到的 VK 私聊身份问题。',
  'automations.reason.identity-question-required':
    '整条消息未被识别为身份问题。',
  'chat.about.identity': '在身份问题中使用的称呼 {when}',
  'questions.kind.reply-identity': '回复身份问题',
  'automations.presets.acquaintance.name': '回复相识问题',
  'automations.presets.acquaintance.description':
    '审核 VK 私聊中询问是否相识时的自我介绍。默认每天最多回复一次。',
  'gratitude.recognizer.acquaintance': '相识问题：我们认识吗？',
  'automations.reason.acquaintance-incoming-required':
    '最新消息必须是收到的 VK 私聊相识问题。',
  'automations.reason.acquaintance-question-required':
    '整条消息未被识别为相识问题。',
  'questions.kind.reply-acquaintance': '回复相识问题',
  'acquaintance.catalogHint':
    '用空行分隔备选回复；每种称呼最多 32 条，每条不超过 4096 字符。每条收到的消息保持相同选择。列表留空时使用下方的普通文本。',
  'acquaintance.alternativeInformal': '备选回复（非正式）',
  'acquaintance.alternativeFormal': '备选回复（正式）',
};
