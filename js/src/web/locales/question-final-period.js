const translations = {
  en: {
    'questions.policyHint':
      'Rejected phrases are excluded from learned and saved answers, including profile substitutions. Historical messages are preserved. Existing final-period pairs share their observed counts.',
    'questions.finalPeriod': 'Final-period pairs',
    'questions.finalPeriodWith': 'Prefer version with a period',
    'questions.finalPeriodWithout': 'Prefer version without a period',
    'questions.finalPeriodHint':
      'Only combines an existing answer and the same answer with one final period. A lone spelling stays unchanged. Broad punctuation equivalence below overrides this preference.',
  },
  hi: {
    'questions.policyHint':
      'अस्वीकृत वाक्यांश सहेजे और सीखे गए उत्तरों से हटाए जाते हैं, प्रोफ़ाइल से भरी जानकारी में भी। पुराने संदेश सुरक्षित रहते हैं। अंतिम बिंदु वाले मौजूदा जोड़ों की वास्तविक गिनती जुड़ती है।',
    'questions.finalPeriod': 'अंतिम बिंदु वाले उत्तरों के जोड़े',
    'questions.finalPeriodWith': 'बिंदु वाले रूप को प्राथमिकता दें',
    'questions.finalPeriodWithout': 'बिना बिंदु वाले रूप को प्राथमिकता दें',
    'questions.finalPeriodHint':
      'केवल मौजूदा उत्तर और उसी उत्तर के अंत में एक बिंदु वाले रूप को जोड़ता है। अकेला रूप नहीं बदलता। नीचे व्यापक विराम चिह्न समानता चुनने पर वही नियम लागू होगा।',
  },
  zh: {
    'questions.policyHint':
      '拒绝的短语会从已保存和学习的答案中排除，包括个人资料替换后的内容。历史消息保持不变。仅末尾句点不同的现有答案对合并实际次数。',
    'questions.finalPeriod': '末尾句点答案对',
    'questions.finalPeriodWith': '优先使用带句点的版本',
    'questions.finalPeriodWithout': '优先使用不带句点的版本',
    'questions.finalPeriodHint':
      '仅合并已经存在且只相差一个末尾英文句点的答案。单独存在的写法保持不变。下方的广义标点等价选项会覆盖此偏好。',
  },
  ru: {
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
