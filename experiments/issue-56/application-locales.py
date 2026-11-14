"""Write the four reviewed application-control dictionaries from one key table."""
import json
from pathlib import Path

rows = {
    "title": ["Native HH application review", "Проверка отклика в HH", "HH आवेदन की समीक्षा", "HH 原生申请审核"],
    "hint": ["Review the full vacancy and native answers. Entering an application can send it immediately. Submission requires your confirmation; only a native success signal confirms delivery.", "Проверьте полную вакансию и ответы. Вход в отклик может сразу отправить его. Для отправки нужно ваше подтверждение; доставка подтверждается только сигналом HH.", "पूरा नौकरी विवरण और मूल उत्तर देखें। आवेदन खोलते ही वह भेजा जा सकता है। भेजने के लिए आपकी पुष्टि चाहिए; केवल HH की सफलता सूचना भेजे जाने की पुष्टि करती है।", "请审核完整职位和原生答案。进入申请可能立即发送。发送需要您的确认，只有 HH 的成功信号才能确认送达。"],
    "settings": ["Application settings", "Настройки отклика", "आवेदन सेटिंग", "申请设置"],
    "coverLetter": ["Reviewed cover letter (up to 24,000 characters)", "Проверенное сопроводительное письмо (до 24 000 знаков)", "समीक्षित परिचय पत्र (24,000 अक्षर तक)", "已审核的求职信（最多 24,000 字符）"],
    "autoExact": ["After filling, send automatically only when every answer is exact and verified", "После заполнения отправлять автоматически, только если все ответы точные и проверены", "भरने के बाद तभी स्वतः भेजें जब सभी उत्तर सटीक और सत्यापित हों", "填写后，仅在所有答案均精确且已验证时自动发送"],
    "delay": ["Review delay before automatic sending (0–30,000 ms)", "Пауза перед автоматической отправкой (0–30 000 мс)", "स्वतः भेजने से पहले समीक्षा विराम (0–30,000 मिलीसेकंड)", "自动发送前的审核延时（0–30,000 毫秒）"],
    "testMode": ["Preview only: no answers or application actions are dispatched", "Только просмотр: ответы и действия отклика не отправляются", "केवल पूर्वावलोकन: उत्तर या आवेदन क्रियाएँ नहीं भेजी जातीं", "仅预览：不执行答案填写或申请操作"],
    "settingsHint": ["These choices freeze when review starts. Recovery restores the server’s original choices. The letter is not saved in this browser. Existing native text is preserved.", "Настройки фиксируются при открытии. Восстановление использует исходные настройки сервера. Письмо не сохраняется в этом браузере. Уже введённый текст сохраняется.", "समीक्षा शुरू होने पर विकल्प स्थिर हो जाते हैं। पुनर्प्राप्ति सर्वर के मूल विकल्प लेती है। पत्र इस ब्राउज़र में सहेजा नहीं जाता। पहले से लिखा मूल पाठ सुरक्षित रहता है।", "审核开始后设置固定。恢复会使用服务器保存的原始设置。求职信不会保存在此浏览器中，已有的原生文本会被保留。"],
    "slot": ["Browser slot: {slot}", "Слот браузера: {slot}", "ब्राउज़र स्लॉट: {slot}", "浏览器槽位：{slot}"],
    "automaticDelay": ["Exact automatic sending is enabled with a {delay} ms review delay.", "Автоотправка точных ответов включена с паузой {delay} мс.", "सटीक उत्तरों के लिए {delay} मिलीसेकंड विराम के साथ स्वतः भेजना चालू है।", "精确答案自动发送已启用，审核延时为 {delay} 毫秒。"],
    "refused": ["The native action was refused. Read the page again before continuing.", "Действие отклонено. Перед продолжением перечитайте страницу.", "मूल क्रिया अस्वीकार हुई। आगे बढ़ने से पहले पेज फिर पढ़ें।", "原生操作被拒绝。继续前请重新读取页面。"],
    "read": ["Read current native page", "Перечитать текущую страницу", "वर्तमान मूल पेज पढ़ें", "读取当前原生页面"],
    "enter": ["Enter application (may send immediately)", "Войти в отклик (возможна немедленная отправка)", "आवेदन खोलें (तुरंत भेजा जा सकता है)", "进入申请（可能立即发送）"],
    "prefill": ["Fill verified exact answers and letter", "Заполнить точные проверенные ответы и письмо", "सत्यापित सटीक उत्तर और पत्र भरें", "填写已验证的精确答案和求职信"],
    "prefillAutomatic": ["Fill exact answers, then send after review delay", "Заполнить точные ответы и отправить после паузы", "सटीक उत्तर भरें, फिर समीक्षा विराम के बाद भेजें", "填写精确答案并在审核延时后发送"],
    "submit": ["Send reviewed application", "Отправить проверенный отклик", "समीक्षित आवेदन भेजें", "发送已审核的申请"],
    "close": ["Close owned application browser", "Закрыть браузер отклика", "आवेदन का अपना ब्राउज़र बंद करें", "关闭此申请的浏览器"],
    "pause": ["Pause applications in this browser slot", "Приостановить отклики в этом слоте браузера", "इस ब्राउज़र स्लॉट में आवेदन रोकें", "暂停此浏览器槽位中的申请"],
    "noQuestionnaires": ["Defer questionnaires in this worker and browser slot", "Отложить анкеты в этом процессе и слоте браузера", "इस कार्यकर्ता और ब्राउज़र स्लॉट में प्रश्नावलियाँ टालें", "在此工作进程和浏览器槽位中暂缓问卷"],
    "sessionHint": ["Pause and questionnaire choices carry across reviews in this worker and browser slot. Restart clears them and the deferred queue. Held forms stay open until you close them or stop the worker. Use Save answers and defer to back up a questionnaire before leaving it.", "Пауза и режим анкет действуют между проверками в этом процессе и слоте. Перезапуск сбрасывает их и очередь. Удерживаемые формы остаются открыты до закрытия или остановки процесса. «Сохранить ответы и отложить» создаёт резервную копию перед выходом из анкеты.", "विराम और प्रश्नावली विकल्प इसी कार्यकर्ता और ब्राउज़र स्लॉट की अगली समीक्षाओं में लागू होते हैं। पुनः आरंभ पर ये और कतार मिट जाते हैं। रोके गए फ़ॉर्म आपके बंद करने या प्रक्रिया रोकने तक खुले रहते हैं। प्रश्नावली छोड़ने से पहले «उत्तर सहेजें और टालें» से बैकअप लें।", "暂停和问卷选项会应用于此进程和浏览器配置中的后续审核。重启会清除这些选项及暂缓队列。保留的表单会一直打开，直到您关闭它或停止进程。离开问卷前，请使用“保存答案并暂缓”进行备份。"],
    "unavailable": ["A connected server with native application review support is required.", "Нужен подключённый сервер с поддержкой проверки откликов.", "मूल आवेदन समीक्षा समर्थित जुड़े सर्वर की आवश्यकता है।", "需要连接支持原生申请审核的服务器。"],
    "choose": ["Collect or choose a saved vacancy to begin.", "Соберите описание или выберите сохранённую вакансию.", "शुरू करने के लिए नौकरी का विवरण लें या सहेजी नौकरी चुनें।", "请先采集或选择已保存的职位。"],
    "bound": ["This review remains bound to its original vacancy and browser slot. Close or finish it before reviewing the new selection.", "Проверка привязана к исходной вакансии и слоту браузера. Закройте или завершите её перед переходом к новому выбору.", "यह समीक्षा अपनी मूल नौकरी और ब्राउज़र स्लॉट से बँधी है। नया चयन देखने से पहले इसे बंद या समाप्त करें।", "此审核仍绑定原职位和浏览器槽位。审核新选择前，请先关闭或结束此审核。"],
    "unknown": ["Current status is unknown. Recover status before another action. Recovery only reads; it never repeats a send.", "Текущий статус неизвестен. Восстановите его перед действием. Восстановление только читает и не повторяет отправку.", "वर्तमान स्थिति अज्ञात है। अगली क्रिया से पहले स्थिति वापस पढ़ें। पुनर्प्राप्ति केवल पढ़ती है; भेजना दोहराती नहीं।", "当前状态未知。执行下一步前请恢复状态。恢复仅读取状态，绝不会重复发送。"],
    "missing": ["The server confirmed there is no saved review for this vacancy and request.", "Сервер подтвердил отсутствие сохранённой проверки этой вакансии и запроса.", "सर्वर ने पुष्टि की कि इस नौकरी और अनुरोध की कोई सहेजी समीक्षा नहीं है।", "服务器确认此职位和请求没有已保存的审核。"],
    "failed": ["The application action or status could not be confirmed. Recover status before continuing.", "Не удалось подтвердить действие или статус отклика. Восстановите статус перед продолжением.", "आवेदन क्रिया या स्थिति की पुष्टि नहीं हुई। आगे बढ़ने से पहले स्थिति वापस पढ़ें।", "无法确认申请操作或状态。继续前请恢复状态。"],
    "working": ["Working with the owned application browser…", "Работа с браузером отклика…", "आवेदन के अपने ब्राउज़र पर काम जारी…", "正在操作此申请的浏览器…"],
    "confirm": ["I reviewed the full vacancy and authorize the labelled application action", "Я проверил полную вакансию и разрешаю указанное действие отклика", "मैंने पूरा नौकरी विवरण देखा है और बटन पर लिखी आवेदन क्रिया की अनुमति देता/देती हूँ", "我已审核完整职位，并授权按钮所述的申请操作"],
    "start": ["Open native review", "Открыть проверку", "मूल समीक्षा खोलें", "打开原生审核"],
    "recover": ["Recover status (read only)", "Восстановить статус (только чтение)", "स्थिति वापस पढ़ें (केवल पढ़ना)", "恢复状态（只读）"],
    "reopen": ["Reopen browser from saved review", "Открыть браузер сохранённой проверки", "सहेजी समीक्षा से ब्राउज़र फिर खोलें", "从已保存审核重新打开浏览器"],
    "release": ["Finish review and use current selection", "Завершить проверку и перейти к выбранной вакансии", "समीक्षा समाप्त कर वर्तमान चयन लें", "结束审核并使用当前选择"],
    "stop": ["Stop and drain application operation", "Остановить и завершить операцию отклика", "आवेदन क्रिया रोकें और पूरी तरह समाप्त करें", "停止申请操作并等待结束"],
    "delivery.none": ["No application dispatch is recorded.", "Отправка отклика не зафиксирована.", "आवेदन भेजने का कोई रिकॉर्ड नहीं है।", "未记录申请发送。"],
    "delivery.unknown": ["Delivery is unknown. A reserved action may have reached HH; it will not be sent again.", "Доставка неизвестна. Зарезервированное действие могло достичь HH; повторной отправки не будет.", "भेजे जाने की स्थिति अज्ञात है। आरक्षित क्रिया HH तक पहुँच सकती है; उसे दोबारा नहीं भेजा जाएगा।", "送达状态未知。已预留操作可能已到达 HH，不会重复发送。"],
    "delivery.provider-confirmed": ["HH confirmed application delivery.", "HH подтвердил доставку отклика.", "HH ने आवेदन पहुँचने की पुष्टि की।", "HH 已确认申请送达。"],
    "letter.not-requested": ["No letter attachment requested yet.", "Прикрепление письма ещё не запрошено.", "पत्र जोड़ने का अनुरोध अभी नहीं हुआ।", "尚未请求添加求职信。"],
    "letter.verified": ["Letter verified in the native application.", "Письмо проверено в отклике HH.", "मूल आवेदन में पत्र सत्यापित है।", "求职信已在原生申请中验证。"],
    "letter.not-attached": ["Letter is not attached.", "Письмо не прикреплено.", "पत्र जुड़ा नहीं है।", "求职信未附上。"],
    "letter.unavailable": ["Letter control is unavailable.", "Поле письма недоступно.", "पत्र का नियंत्रण उपलब्ध नहीं है।", "求职信控件不可用。"],
    "letter.unverified": ["Letter contents could not be verified.", "Содержимое письма не подтверждено.", "पत्र की सामग्री सत्यापित नहीं हुई।", "无法验证求职信内容。"],
    "letter.owner-conflict": ["Existing owner letter preserved; automatic sending is blocked.", "Ваше существующее письмо сохранено; автоотправка заблокирована.", "पहले से मौजूद आपका पत्र सुरक्षित है; स्वतः भेजना अवरुद्ध है।", "已保留您现有的求职信，自动发送被阻止。"],
}
rows.update({
    "backup": [
        "Back up current native answers",
        "Сохранить текущие ответы HH",
        "मौजूदा HH उत्तरों का बैकअप लें",
        "备份当前 HH 答案"
    ],
    "restore": [
        "Restore reviewed draft into empty controls",
        "Восстановить проверенный черновик в пустые поля",
        "समीक्षित ड्राफ़्ट खाली फ़ील्ड में बहाल करें",
        "将已审核草稿恢复到空白控件"
    ],
    "draft": [
        "Private saved questionnaire draft",
        "Личный черновик анкеты",
        "प्रश्नावली का निजी सहेजा हुआ ड्राफ़्ट",
        "已保存的私人问卷草稿"
    ],
    "draftSaved": [
        "Saved on this server at {time}",
        "Сохранён на этом сервере: {time}",
        "इस सर्वर पर सहेजने का समय: {time}",
        "保存于此服务器：{time}"
    ],
    "draftHint": [
        "Open the same native questions, including the letter control, before restoring. Review this private copy first. Existing answers are preserved; restoration never sends or learns answers. Backups are explicit and are not a retry queue.",
        "Перед восстановлением откройте те же вопросы и поле письма. Сначала проверьте эту личную копию. Существующие ответы сохраняются; восстановление не отправляет отклик и не обучает базу ответов. Копия сохраняется явно и не является очередью повторных попыток.",
        "बहाल करने से पहले वही प्रश्न और पत्र का फ़ील्ड खोलें। पहले इस निजी प्रति की समीक्षा करें। मौजूदा उत्तर सुरक्षित रहेंगे; बहाली से आवेदन नहीं भेजा जाता और उत्तर नहीं सीखे जाते। बैकअप स्पष्ट कार्रवाई है, पुनः प्रयास की कतार नहीं।",
        "恢复前请打开相同的问题和求职信控件。请先审核这份私人副本。现有答案会被保留；恢复不会提交申请或学习答案。备份需要明确操作，不是重试队列。"
    ],
    "draft.checked": [
        "Checked",
        "Отмечено",
        "चुना गया",
        "已选中"
    ],
    "draft.unchecked": [
        "Unchecked",
        "Не отмечено",
        "नहीं चुना गया",
        "未选中"
    ],
    "restore.restoring": [
        "Restoration started; read the native page to confirm its current values.",
        "Восстановление начато; прочитайте страницу HH, чтобы проверить текущие значения.",
        "बहाली शुरू हुई; मौजूदा मान जाँचने के लिए HH पृष्ठ फिर पढ़ें।",
        "已开始恢复；请重新读取 HH 页面以确认当前值。"
    ],
    "restore.restored": [
        "Draft values verified in native controls. Review the answers before sending.",
        "Значения черновика проверены в полях HH. Проверьте ответы перед отправкой.",
        "ड्राफ़्ट के मान HH फ़ील्ड में सत्यापित हैं। भेजने से पहले उत्तरों की समीक्षा करें।",
        "草稿值已在 HH 控件中验证。提交前请审核答案。"
    ],
    "restore.refused": [
        "Restoration refused; existing answers are preserved. Read the page again.",
        "Восстановление отклонено; существующие ответы сохранены. Прочитайте страницу снова.",
        "बहाली अस्वीकार हुई; मौजूदा उत्तर सुरक्षित हैं। पृष्ठ फिर पढ़ें।",
        "恢复被拒绝；现有答案已保留。请重新读取页面。"
    ],
    "restore.partial": [
        "Some draft values were restored. Read the native page before continuing.",
        "Часть значений восстановлена. Прочитайте страницу HH перед продолжением.",
        "कुछ मान बहाल हुए। आगे बढ़ने से पहले HH पृष्ठ पढ़ें।",
        "已恢复部分草稿值。继续前请读取 HH 页面。"
    ],
    "restore.uncertain": [
        "Restoration could not be confirmed. Read the native page before another action.",
        "Восстановление не подтверждено. Прочитайте страницу HH перед следующим действием.",
        "बहाली की पुष्टि नहीं हुई। दूसरी कार्रवाई से पहले HH पृष्ठ पढ़ें।",
        "无法确认恢复结果。进行其他操作前请读取 HH 页面。"
    ],
    "delivery.none": [
        "HH has not confirmed application delivery.",
        "HH пока не подтвердил доставку отклика.",
        "HH ने आवेदन की डिलीवरी की पुष्टि नहीं की है।",
        "HH 尚未确认申请送达。"
    ]
})
states = {
    "opening": ["Opening native review", "Открытие проверки", "मूल समीक्षा खुल रही है", "正在打开原生审核"],
    "ready": ["Ready to enter the application", "Можно войти в отклик", "आवेदन खोलने के लिए तैयार", "可进入申请"],
    "review": ["Review native answers before sending", "Проверьте ответы перед отправкой", "भेजने से पहले मूल उत्तर देखें", "发送前请审核原生答案"],
    "verification": ["Complete verification in the owned HH browser", "Пройдите проверку в браузере HH", "अपने HH ब्राउज़र में सत्यापन पूरा करें", "请在此 HH 浏览器中完成验证"],
    "daily-limit": ["HH daily application limit reached", "Достигнут дневной лимит HH", "HH की दैनिक आवेदन सीमा पूरी हुई", "已达到 HH 每日申请上限"],
    "external": ["External application requires manual review", "Внешний отклик требует ручной проверки", "बाहरी आवेदन को मानवीय समीक्षा चाहिए", "外部申请需要人工审核"],
    "delivered": ["Application delivered", "Отклик доставлен", "आवेदन पहुँच गया", "申请已送达"],
    "wrong-page": ["Native page does not match this vacancy", "Страница не соответствует вакансии", "मूल पेज इस नौकरी से मेल नहीं खाता", "原生页面与此职位不匹配"],
    "unavailable": ["Native application control unavailable", "Элемент отклика недоступен", "मूल आवेदन नियंत्रण उपलब्ध नहीं", "原生申请控件不可用"],
    "interrupted": ["Review interrupted; saved dispatch reservations retained", "Проверка прервана; отправки остаются зарезервированы", "समीक्षा बाधित; भेजने के आरक्षण सुरक्षित हैं", "审核已中断，发送预留记录已保留"],
    "sending": ["Native action dispatched; awaiting evidence", "Действие отправлено; ожидается подтверждение", "मूल क्रिया भेजी गई; प्रमाण की प्रतीक्षा है", "原生操作已发出，正在等待证据"],
    "review-delay": ["Review delay before automatic sending", "Пауза перед автоотправкой", "स्वतः भेजने से पहले समीक्षा विराम", "自动发送前的审核延时"],
    "deferred": ["Questionnaire deferred in this review", "Анкета отложена в этой проверке", "इस समीक्षा में प्रश्नावली टाली गई", "此次审核中的问卷已暂缓"],
    "paused": ["Review paused", "Проверка приостановлена", "समीक्षा रुकी है", "审核已暂停"],
    "test-preview": ["Preview complete; no application action dispatched", "Просмотр завершён; действие отклика не отправлено", "पूर्वावलोकन पूरा; आवेदन क्रिया नहीं भेजी गई", "预览完成，未执行申请操作"],
    "closed": ["Owned application browser closed", "Браузер отклика закрыт", "आवेदन का अपना ब्राउज़र बंद है", "此申请的浏览器已关闭"],
}
rows.update({f"state.{key}": value for key, value in states.items()})
rows.update({
    "defer": ["Save answers and defer", "Сохранить ответы и отложить", "उत्तर सहेजें और टालें", "保存答案并暂缓"],
    "queueTitle": ["Deferred questionnaires", "Отложенные анкеты", "टाली गई प्रश्नावलियाँ", "暂缓的问卷"],
    "queueHint": [
        "Save and defer keeps a private recovery copy and actual Q&A observations before closing. Eligible answers become unapproved knowledge. This queue lasts only in the current worker; reopening requires fresh review and does not restore or send answers. Separately saved exclusions still apply.",
        "Перед закрытием сохраняются личная копия для восстановления и фактические вопросы и ответы. Допустимые ответы попадают в базу без одобрения. Очередь живёт только в текущем процессе; открытие требует новой проверки и не восстанавливает и не отправляет ответы. Сохранённые отдельно исключения действуют.",
        "बंद करने से पहले निजी पुनर्प्राप्ति प्रति और वास्तविक प्रश्न-उत्तर सहेजे जाते हैं। योग्य उत्तर बिना स्वीकृति वाले ज्ञान बनते हैं। कतार केवल वर्तमान प्रक्रिया तक रहती है; फिर खोलने पर नई समीक्षा होगी, उत्तर बहाल या भेजे नहीं जाएँगे। अलग से सहेजे बहिष्करण लागू रहते हैं।",
        "关闭前会保存私人恢复副本及实际问答。符合条件的答案作为未批准的知识保存。队列仅存在于当前进程；重新打开需要再次审核，不会恢复或发送答案。单独保存的排除项仍然有效。",
    ],
    "queueRead": ["Refresh deferred queue", "Обновить очередь", "टाली गई कतार ताज़ा करें", "刷新暂缓队列"],
    "queueLoading": ["Reading the current worker queue…", "Чтение очереди текущего процесса…", "वर्तमान प्रक्रिया की कतार पढ़ी जा रही है…", "正在读取当前进程的队列…"],
    "queueUnknown": ["The queue could not be read. No vacancy was reopened.", "Очередь прочитать не удалось. Вакансии не открывались.", "कतार पढ़ी नहीं जा सकी। कोई नौकरी फिर नहीं खोली गई।", "无法读取队列。未重新打开任何职位。"],
    "queueEmpty": ["No questionnaires queued in this browser slot.", "В этом профиле браузера нет анкет в очереди.", "इस ब्राउज़र स्लॉट में कोई प्रश्नावली कतार में नहीं है।", "此浏览器配置中没有排队的问卷。"],
    "retry": ["Reopen for fresh review", "Открыть для новой проверки", "नई समीक्षा के लिए फिर खोलें", "重新打开以再次审核"],
})
root = Path(__file__).resolve().parents[2] / "js/src/web/locales"
for index, locale in enumerate(("en", "ru", "hi", "zh")):
    entries = {f"application.{key}": values[index] for key, values in rows.items()}
    (root / f"{locale}-application.js").write_text(
        f"export const {locale}Application = "
        + json.dumps(entries, ensure_ascii=False, indent=2) + ";\n"
    )
