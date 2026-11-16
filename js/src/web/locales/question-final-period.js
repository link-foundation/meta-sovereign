const translations = {
  en: {
    'questions.equivalentAnswers': 'Equivalent answer wordings, one per line',
    'questions.equivalentAnswersHint':
      'Use this answer for these exact wordings of this question. Combine actual observed counts; keep original messages. Approval applies to the preferred answer above. Different commitments stay separate; conflicting preferences require review.',
    'questions.policyHint':
      'Rejected phrases are excluded from learned and saved answers, including profile substitutions. Historical messages are preserved. Existing final-period pairs share their observed counts.',
    'questions.finalPeriod': 'Final-period pairs',
    'questions.finalPeriodWith': 'Prefer version with a period',
    'questions.finalPeriodWithout': 'Prefer version without a period',
    'questions.finalPeriodHint':
      'Only combines an existing answer and the same answer with one final period. A lone spelling stays unchanged. Broad punctuation equivalence below overrides this preference.',
  },
  hi: {
    'questions.equivalentAnswers': 'समान अर्थ वाले उत्तर, हर पंक्ति में एक',
    'questions.equivalentAnswersHint':
      'इस प्रश्न के इन सटीक रूपों के लिए ऊपर वाला उत्तर उपयोग करें। वास्तविक गिनती जोड़ें और मूल संदेश सुरक्षित रखें। स्वीकृति ऊपर के पसंदीदा उत्तर पर लागू होती है। अलग प्रतिबद्धताएँ अलग रहती हैं; विरोधी प्राथमिकताओं की समीक्षा ज़रूरी है।',
    'questions.policyHint':
      'अस्वीकृत वाक्यांश सहेजे और सीखे गए उत्तरों से हटाए जाते हैं, प्रोफ़ाइल से भरी जानकारी में भी। पुराने संदेश सुरक्षित रहते हैं। अंतिम बिंदु वाले मौजूदा जोड़ों की वास्तविक गिनती जुड़ती है।',
    'questions.finalPeriod': 'अंतिम बिंदु वाले उत्तरों के जोड़े',
    'questions.finalPeriodWith': 'बिंदु वाले रूप को प्राथमिकता दें',
    'questions.finalPeriodWithout': 'बिना बिंदु वाले रूप को प्राथमिकता दें',
    'questions.finalPeriodHint':
      'केवल मौजूदा उत्तर और उसी उत्तर के अंत में एक बिंदु वाले रूप को जोड़ता है। अकेला रूप नहीं बदलता। नीचे व्यापक विराम चिह्न समानता चुनने पर वही नियम लागू होगा।',
  },
  zh: {
    'questions.equivalentAnswers': '等价答案措辞，每行一个',
    'questions.equivalentAnswersHint':
      '此问题遇到这些精确措辞时使用上方答案。合并实际观察次数并保留原消息。批准仅适用于上方首选答案。不同承诺保持独立；偏好冲突需要审核。',
    'questions.policyHint':
      '拒绝的短语会从已保存和学习的答案中排除，包括个人资料替换后的内容。历史消息保持不变。仅末尾句点不同的现有答案对合并实际次数。',
    'questions.finalPeriod': '末尾句点答案对',
    'questions.finalPeriodWith': '优先使用带句点的版本',
    'questions.finalPeriodWithout': '优先使用不带句点的版本',
    'questions.finalPeriodHint':
      '仅合并已经存在且只相差一个末尾英文句点的答案。单独存在的写法保持不变。下方的广义标点等价选项会覆盖此偏好。',
  },
  ru: {
    'questions.equivalentAnswers':
      'Равнозначные формулировки ответа, по одной на строку',
    'questions.equivalentAnswersHint':
      'Для этих точных формулировок ответа на этот вопрос использовать ответ выше. Суммируются реальные наблюдения; исходные сообщения сохраняются. Одобрение относится к предпочтительному ответу выше. Другие обязательства остаются отдельными; конфликт предпочтений требует проверки.',
    'questions.policyHint':
      'Отклонённые фразы исключаются из сохранённых и изученных ответов, включая подстановки профиля. История сообщений сохраняется. Частоты существующих пар с конечной точкой суммируются.',
    'questions.finalPeriod': 'Пары ответов с конечной точкой',
    'questions.finalPeriodWith': 'Предпочитать вариант с точкой',
    'questions.finalPeriodWithout': 'Предпочитать вариант без точки',
    'questions.finalPeriodHint':
      'Объединяются только существующий ответ и тот же ответ с одной конечной точкой. Одиночный вариант не меняется. Общее объединение пунктуации ниже имеет приоритет.',
  },
};

export const questionFinalPeriodLocale = (language) =>
  translations[language] ?? translations.en;
