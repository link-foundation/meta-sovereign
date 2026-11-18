const messages = {
  en: [
    'Introduce yourself after a negative acquaintance answer',
    'Review a sticker followed by your introduction after a negative answer to “Have we talked before?” in a personal VK chat.',
    'Send the sticker first, then the introduction. Each step has its own receipt. An uncertain step needs manual outbox review; a definite failure can resume after another review.',
    'The latest message must be incoming in a personal VK chat.',
    'A complete negative acquaintance answer is required.',
    'The adjacent outgoing personal message must ask “Мы общались ранее?”.',
    'Not sent',
    'Sending; delivery is not yet confirmed',
    'Sent',
    'Not delivered; review before retrying',
    'Delivery uncertain; check the outbox and chat',
  ],
  ru: [
    'Представиться после отрицательного ответа о знакомстве',
    'Предпросмотр стикера и следующего за ним представления после отрицательного ответа на «Мы общались ранее?» в личном чате ВКонтакте.',
    'Сначала отправляется стикер, затем представление. Для каждого шага сохраняется отдельное подтверждение. При неизвестном результате проверьте исходящие вручную; явный отказ можно повторить после нового просмотра.',
    'Последнее сообщение должно быть входящим в личном чате ВКонтакте.',
    'Требуется полный отрицательный ответ о предыдущем общении.',
    'Соседнее исходящее личное сообщение должно содержать вопрос «Мы общались ранее?».',
    'Не отправлено',
    'Отправляется; доставка ещё не подтверждена',
    'Отправлено',
    'Не доставлено; просмотрите перед повтором',
    'Доставка неизвестна; проверьте исходящие и чат',
  ],
  hi: [
    'परिचय से इनकार के बाद अपना परिचय दें',
    'निजी VK चैट में “क्या हमने पहले बात की है?” के नकारात्मक उत्तर के बाद स्टिकर और फिर अपने परिचय की समीक्षा करें।',
    'पहले स्टिकर, फिर परिचय भेजें। हर चरण की अलग रसीद है। अनिश्चित चरण के लिए आउटबॉक्स में स्वयं जाँचें; निश्चित विफलता की नई समीक्षा के बाद आगे बढ़ सकते हैं।',
    'नवीनतम संदेश निजी VK चैट में आने वाला होना चाहिए।',
    'पिछली बातचीत के बारे में पूरा नकारात्मक उत्तर आवश्यक है।',
    'ठीक पिछले भेजे गए निजी संदेश में “Мы общались ранее?” पूछा होना चाहिए।',
    'नहीं भेजा गया',
    'भेजा जा रहा है; वितरण की पुष्टि बाकी है',
    'भेजा गया',
    'नहीं पहुँचा; दोबारा कोशिश से पहले समीक्षा करें',
    'वितरण अनिश्चित; आउटबॉक्स और चैट जाँचें',
  ],
  zh: [
    '在对方否认曾交谈后自我介绍',
    '在 VK 私聊中，对方否认“我们以前交谈过吗？”后，预览先发贴纸、再自我介绍的回复。',
    '先发送贴纸，再发送介绍。每一步单独保留回执。结果不明时请手动检查发件箱；明确失败后可重新审阅并继续。',
    '最新消息必须是 VK 私聊中的收到消息。',
    '需要对以前是否交谈过的完整否定答复。',
    '紧邻的已发送私聊消息必须询问“Мы общались ранее?”。',
    '未发送',
    '正在发送；尚未确认送达',
    '已发送',
    '未送达；请审阅后重试',
    '送达情况不明；请检查发件箱和聊天',
  ],
};
const recovery = {
  en: [
    'Comma-separated positive VK sticker IDs. API access and the sticker pack are required; the sticker is the first step of this reply.',
    'Sticker sent; introduction not delivered. Review the remaining text before retrying.',
    'Delivery uncertain. Check each step in the outbox and actual chat before continuing.',
  ],
  ru: [
    'Положительные ID стикеров ВКонтакте через запятую. Нужны доступ к API и набор стикеров; стикер — первый шаг ответа.',
    'Стикер отправлен, представление не доставлено. Просмотрите оставшийся текст перед повтором.',
    'Результат доставки неизвестен. Перед продолжением проверьте каждый шаг в исходящих и самом чате.',
  ],
  hi: [
    'अल्पविराम से अलग सकारात्मक VK स्टिकर ID। API पहुँच और स्टिकर पैक आवश्यक हैं; स्टिकर इस उत्तर का पहला चरण है।',
    'स्टिकर भेजा गया; परिचय नहीं पहुँचा। दोबारा कोशिश से पहले बचे पाठ की समीक्षा करें।',
    'वितरण अनिश्चित है। आगे बढ़ने से पहले आउटबॉक्स और वास्तविक चैट में हर चरण जाँचें।',
  ],
  zh: [
    '用逗号分隔正整数 VK 贴纸 ID。需要 API 权限和相应贴纸包；贴纸是此回复的第一步。',
    '贴纸已发送，介绍未送达。重试前请审阅剩余文本。',
    '送达情况不明。继续前请在发件箱和实际聊天中核对每一步。',
  ],
};
export const engagementLocale = (language) => {
  const [name, description, hint, incoming, question, context, ...statuses] =
    messages[language];
  return {
    'automations.presets.engagement.name': name,
    'automations.presets.engagement.description': description,
    'questions.kind.reply-engagement': name,
    'gratitude.recognizer.engagement': name,
    'engagement.hint': hint,
    ...Object.fromEntries(
      ['stickersHint', 'partial', 'uncertain'].map((key, index) => [
        `engagement.${key}`,
        recovery[language][index],
      ])
    ),
    'automations.reason.engagement-incoming-required': incoming,
    'automations.reason.engagement-question-required': question,
    'automations.reason.engagement-context-required': context,
    ...Object.fromEntries(
      ['pending', 'sending', 'sent', 'failed', 'unknown'].map((key, index) => [
        `engagement.step.${key}`,
        statuses[index],
      ])
    ),
  };
};
