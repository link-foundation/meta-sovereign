const entries = {
  en: {
    title: 'Plan experience changes',
    hint: 'Use the two selected snapshots to plan additions and updates in the target language. Target-only jobs are kept. Review only: preparing provider forms and saving each change require a separate step.',
    direction: 'Direction',
    request: 'Request ID · use an existing ID to recover a plan',
    start: 'Build translated plan',
    status: 'Check saved plan',
    stop: 'Stop planning',
    new: 'New plan',
    working: 'Planning and comparing translations…',
    error:
      'The operation was not confirmed. Your selections and last confirmed plan are retained.',
    unknown:
      'Outcome unknown. Checking the saved request without starting it again. Stop can cancel this request before creating another.',
    planning: 'Preparing the plan.',
    translating: 'Comparing translations.',
    completed:
      'Planning finished. Review every proposed change and any unresolved fields.',
    failed:
      'Planning failed. Saved snapshots and confirmed results are retained.',
    stopped: 'Planning stopped.',
    interrupted: 'Planning was interrupted. This request will not restart.',
    add: 'Proposed addition',
    update: 'Proposed update',
    keep: 'Keep target job',
    review: 'Review required',
    profile: 'Separate profile review',
    source: 'Source',
    target: 'Target',
    before: 'Current target',
    after: 'Proposed value',
    about: 'About',
    media: 'Media',
    translations: 'Translation comparison',
    workplaceSelect: 'Review this workplace in HeadHunter',
    workplaceStage: 'Create workplace draft',
    workplaceOpen: 'Open workplace review',
    workplaceBusy: 'Checking the HeadHunter export…',
    workplaceDraft:
      'A workplace draft is ready for review in the {slot} browser slot.',
    workplaceNote:
      'This change has no fields that the HeadHunter workplace form can use. Its notes are kept above.',
    workplaceTranslation:
      'A field still needs a confirmed translation. Review the plan before preparing the form.',
    workplaceConflict:
      'The HeadHunter snapshot changed. Capture the current CV and build a new plan.',
    workplaceError:
      'The workplace draft could not be confirmed. The plan and input are kept.',
    workplaceReview: 'Workplace review from experience plan',
    workplaceDismiss: 'Close review',
    workplaceSlot:
      'Select the {slot} browser slot in Jobs to review and prepare this draft.',
    workplaceUnapplied: 'Review {field} separately in the experience plan.',
    text: 'Download plan as Lino',
    binary: 'Download plan as binary Lino',
    'missing-source-kept': 'Source value is missing; keep the target value.',
    'personal-name-review':
      'Personal names require separate profile review. HH shares the name across CVs.',
    'unsupported-field':
      'Keep the original metadata and review how this field maps to the target.',
    'target-only-kept': 'This job exists only on the target and is kept.',
    'unknown-period':
      'Dates are incomplete. Choose a match before preparing a change.',
    ambiguous:
      'Several roles overlap. Choose a match before preparing a change.',
    'translation-limit':
      'This field exceeds the translation limit. The complete original is retained.',
    'translation-unconfirmed':
      'No usable translation has been confirmed. Keep this field unresolved.',
  },
  ru: {
    title: 'План изменений опыта',
    hint: 'Планируйте добавления и изменения на языке назначения по двум выбранным снимкам. Места работы, имеющиеся только в назначении, сохраняются. Только проверка: подготовка форм и сохранение каждого изменения выполняются отдельно.',
    direction: 'Направление',
    request: 'ID запроса · укажите существующий ID для восстановления плана',
    start: 'Создать план с переводами',
    status: 'Проверить сохранённый план',
    stop: 'Остановить планирование',
    new: 'Новый план',
    working: 'Планирование и сравнение переводов…',
    error:
      'Операция не подтверждена. Ваш выбор и последний подтверждённый план сохранены.',
    unknown:
      'Результат неизвестен. Проверяем сохранённый запрос без повторного запуска. Остановите его перед созданием нового.',
    planning: 'Подготовка плана.',
    translating: 'Сравнение переводов.',
    completed:
      'Планирование завершено. Проверьте все предлагаемые изменения и нерешённые поля.',
    failed: 'Сбой планирования. Снимки и подтверждённые результаты сохранены.',
    stopped: 'Планирование остановлено.',
    interrupted:
      'Планирование прервано. Этот запрос не будет запущен повторно.',
    add: 'Предлагаемое добавление',
    update: 'Предлагаемое изменение',
    keep: 'Сохранить место работы назначения',
    review: 'Требуется проверка',
    profile: 'Отдельная проверка профиля',
    source: 'Источник',
    target: 'Назначение',
    before: 'Текущее значение',
    after: 'Предлагаемое значение',
    about: 'О себе',
    media: 'Медиа',
    translations: 'Сравнение переводов',
    workplaceSelect: 'Проверить это место работы в HeadHunter',
    workplaceStage: 'Создать черновик места работы',
    workplaceOpen: 'Открыть проверку места работы',
    workplaceBusy: 'Проверяем экспорт из HeadHunter…',
    workplaceDraft:
      'Черновик места работы готов к проверке в слоте браузера {slot}.',
    workplaceNote:
      'В этом изменении нет полей для формы места работы HeadHunter. Примечания сохранены выше.',
    workplaceTranslation:
      'Для одного из полей нужен подтверждённый перевод. Проверьте план перед подготовкой формы.',
    workplaceConflict:
      'Снимок HeadHunter изменился. Получите актуальное резюме и создайте новый план.',
    workplaceError:
      'Не удалось подтвердить черновик. План и введённые данные сохранены.',
    workplaceReview: 'Проверка места работы по плану опыта',
    workplaceDismiss: 'Закрыть проверку',
    workplaceSlot:
      'Выберите в разделе вакансий слот браузера {slot}, чтобы проверить и подготовить черновик.',
    workplaceUnapplied:
      'Поле «{field}» остаётся в плане опыта для отдельной проверки.',
    text: 'Скачать план в Lino',
    binary: 'Скачать план в двоичном Lino',
    'missing-source-kept':
      'Значение в источнике отсутствует; сохраните значение назначения.',
    'personal-name-review':
      'Имя требует отдельной проверки профиля. На HH имя общее для всех резюме.',
    'unsupported-field':
      'Сохраните исходные метаданные и проверьте соответствие поля назначению.',
    'target-only-kept':
      'Это место работы есть только в назначении и сохраняется.',
    'unknown-period':
      'Даты неполные. Уточните соответствие перед подготовкой изменения.',
    ambiguous:
      'Несколько должностей пересекаются. Уточните соответствие перед подготовкой изменения.',
    'translation-limit':
      'Поле превышает лимит перевода. Полный оригинал сохранён.',
    'translation-unconfirmed':
      'Подходящий перевод не подтверждён. Поле остаётся нерешённым.',
  },
  hi: {
    title: 'कार्य अनुभव में बदलाव की योजना',
    hint: 'चुने हुए दो स्नैपशॉट से लक्ष्य भाषा में जोड़ने और अपडेट करने की योजना बनाएं। केवल लक्ष्य पर मौजूद नौकरियाँ रखी जाती हैं। केवल समीक्षा: प्रदाता फ़ॉर्म भरना और हर बदलाव सहेजना अलग चरण है।',
    direction: 'दिशा',
    request: 'अनुरोध ID · योजना वापस पाने के लिए मौजूदा ID दें',
    start: 'अनुवाद सहित योजना बनाएं',
    status: 'सहेजी योजना जाँचें',
    stop: 'योजना रोकें',
    new: 'नई योजना',
    working: 'योजना और अनुवाद तुलना जारी है…',
    error:
      'कार्य की पुष्टि नहीं हुई। आपका चयन और अंतिम पुष्ट योजना सुरक्षित हैं।',
    unknown:
      'परिणाम अज्ञात है। सहेजे अनुरोध की जाँच बिना फिर शुरू किए हो रही है। नया अनुरोध बनाने से पहले इसे रोक सकते हैं।',
    planning: 'योजना तैयार हो रही है।',
    translating: 'अनुवादों की तुलना हो रही है।',
    completed:
      'योजना पूरी हुई। हर प्रस्तावित बदलाव और अनसुलझे फ़ील्ड की समीक्षा करें।',
    failed: 'योजना विफल हुई। सहेजे स्नैपशॉट और पुष्ट परिणाम सुरक्षित हैं।',
    stopped: 'योजना रोक दी गई।',
    interrupted: 'योजना बाधित हुई। यह अनुरोध दोबारा शुरू नहीं होगा।',
    add: 'प्रस्तावित जोड़',
    update: 'प्रस्तावित अपडेट',
    keep: 'लक्ष्य नौकरी रखें',
    review: 'समीक्षा आवश्यक',
    profile: 'अलग प्रोफ़ाइल समीक्षा',
    source: 'स्रोत',
    target: 'लक्ष्य',
    before: 'लक्ष्य का वर्तमान मान',
    after: 'प्रस्तावित मान',
    about: 'परिचय',
    media: 'मीडिया',
    translations: 'अनुवाद तुलना',
    workplaceSelect: 'HeadHunter में इस कार्यस्थल की समीक्षा करें',
    workplaceStage: 'कार्यस्थल का ड्राफ़्ट बनाएँ',
    workplaceOpen: 'कार्यस्थल की समीक्षा खोलें',
    workplaceBusy: 'HeadHunter एक्सपोर्ट जाँचा जा रहा है…',
    workplaceDraft:
      'कार्यस्थल का ड्राफ़्ट {slot} ब्राउज़र स्लॉट में समीक्षा के लिए तैयार है।',
    workplaceNote:
      'इस बदलाव में HeadHunter के कार्यस्थल फ़ॉर्म के लिए कोई फ़ील्ड उपलब्ध नहीं है। नोट ऊपर रखे गए हैं।',
    workplaceTranslation:
      'एक फ़ील्ड का अनुवाद अभी अपुष्ट है। फ़ॉर्म तैयार करने से पहले योजना की समीक्षा करें।',
    workplaceConflict:
      'HeadHunter स्नैपशॉट बदल गया है। मौजूदा सीवी लेकर नई योजना बनाएँ।',
    workplaceError:
      'कार्यस्थल के ड्राफ़्ट की पुष्टि नहीं हुई। योजना और दर्ज जानकारी सुरक्षित हैं।',
    workplaceReview: 'अनुभव योजना से कार्यस्थल की समीक्षा',
    workplaceDismiss: 'समीक्षा बंद करें',
    workplaceSlot:
      'ड्राफ़्ट की समीक्षा और तैयारी के लिए नौकरियों में {slot} ब्राउज़र स्लॉट चुनें।',
    workplaceUnapplied:
      '{field} अलग समीक्षा के लिए अनुभव योजना में रखा गया है।',
    text: 'योजना Lino में डाउनलोड करें',
    binary: 'योजना बाइनरी Lino में डाउनलोड करें',
    'missing-source-kept': 'स्रोत का मान नहीं है; लक्ष्य का मान रखें।',
    'personal-name-review':
      'नाम के लिए अलग प्रोफ़ाइल समीक्षा चाहिए। HH सभी CV में एक ही नाम रखता है।',
    'unsupported-field':
      'मूल मेटाडेटा रखें और लक्ष्य पर इस फ़ील्ड के मिलान की समीक्षा करें।',
    'target-only-kept': 'यह नौकरी केवल लक्ष्य पर है और रखी जाती है।',
    'unknown-period':
      'तारीखें अधूरी हैं। बदलाव तैयार करने से पहले मिलान चुनें।',
    ambiguous:
      'कई भूमिकाओं की अवधि एक साथ आती है। बदलाव तैयार करने से पहले मिलान चुनें।',
    'translation-limit':
      'यह फ़ील्ड अनुवाद सीमा से बड़ा है। पूरा मूल पाठ सुरक्षित है।',
    'translation-unconfirmed':
      'उपयोगी अनुवाद की पुष्टि नहीं हुई। यह फ़ील्ड अनसुलझा रखें।',
  },
  zh: {
    title: '规划工作经历更改',
    hint: '使用所选两份快照，以目标语言规划新增和更新。保留仅存在于目标端的职位。仅供审核：填写平台表单及逐项保存需要单独进行。',
    direction: '方向',
    request: '请求 ID · 输入已有 ID 以恢复计划',
    start: '生成翻译计划',
    status: '检查已存计划',
    stop: '停止规划',
    new: '新建计划',
    working: '正在规划并比较翻译…',
    error: '操作未获确认。您的选择和最后确认的计划均已保留。',
    unknown:
      '结果未知。正在检查已存请求，不会重新启动。创建新请求前可以停止此请求。',
    planning: '正在准备计划。',
    translating: '正在比较翻译。',
    completed: '规划完成。请审核每项拟议更改及未解决的字段。',
    failed: '规划失败。已存快照和已确认的结果均已保留。',
    stopped: '规划已停止。',
    interrupted: '规划已中断。不会重新启动此请求。',
    add: '拟议新增',
    update: '拟议更新',
    keep: '保留目标职位',
    review: '需要审核',
    profile: '单独审核个人资料',
    source: '来源',
    target: '目标',
    before: '目标当前值',
    after: '拟议值',
    about: '关于',
    media: '媒体',
    translations: '翻译比较',
    workplaceSelect: '在 HeadHunter 中审核此工作经历',
    workplaceStage: '创建工作经历草稿',
    workplaceOpen: '打开工作经历审核',
    workplaceBusy: '正在核对 HeadHunter 导出文件…',
    workplaceDraft: '工作经历草稿已就绪，可在 {slot} 浏览器槽位中审核。',
    workplaceNote:
      '这项更改没有可用于 HeadHunter 工作经历表单的字段。备注保留在上方。',
    workplaceTranslation: '有字段的译文仍需确认。请先审核计划，再准备表单。',
    workplaceConflict: 'HeadHunter 快照已更改。请获取当前简历并重新生成计划。',
    workplaceError: '无法确认工作经历草稿。计划和已输入的信息均已保留。',
    workplaceReview: '审核经历计划中的工作经历',
    workplaceDismiss: '关闭审核',
    workplaceSlot: '请在职位页面选择 {slot} 浏览器槽位，以审核并准备此草稿。',
    workplaceUnapplied: '“{field}”保留在经历计划中，供单独审核。',
    text: '下载 Lino 计划',
    binary: '下载二进制 Lino 计划',
    'missing-source-kept': '来源值缺失；保留目标值。',
    'personal-name-review': '姓名需要单独审核个人资料。HH 的所有简历共用姓名。',
    'unsupported-field': '保留原始元数据，并审核此字段如何对应目标端。',
    'target-only-kept': '此职位仅存在于目标端，将予以保留。',
    'unknown-period': '日期不完整。准备更改前请先确定匹配项。',
    ambiguous: '多项职位时间重叠。准备更改前请先确定匹配项。',
    'translation-limit': '此字段超出翻译限制。完整原文已保留。',
    'translation-unconfirmed': '尚未确认可用翻译。此字段仍待解决。',
  },
};
export const experiencePlanLocale = (language) =>
  Object.fromEntries(
    Object.entries(entries[language] ?? entries.en).map(([key, value]) => [
      `experiencePlan.${key}`,
      value,
    ])
  );
