"""Record verified automatic rates while keeping broader Q/A work open."""
from pathlib import Path

root = Path(__file__).resolve().parents[2]
states = {
    "": "Partial: shared scoped/approved rules, corrections/equivalence, rejected wording, summary facts, configured contexts, independent salary targets and configurable tax calculations have CLI/API/UI regressions and screenshots. Explicit and automatic primary CBR refresh, lot normalization, dated-cache recovery, request coalescing/backoff and current-clock delivery pass focused checks (31 in the automatic-policy step) and browser verification. See [Q/A](case-studies/issue-56/question-answers.md), [calculation](case-studies/issue-56/salary-calculation.md) and [automatic rates](case-studies/issue-56/salary-exchange-policy.md). Cumulative archive learning, salary placeholders, both-basis wording, wider language/form and full provider parity remain open.",
    ".ru": "Частично: общие правила, одобрение, исправления, эквивалентность, запрет формулировок, факты из итогов, контексты, независимые зарплатные суммы и настраиваемые налоги проверены через CLI/API/UI со снимками. Явная и автоматическая загрузка ЦБ РФ, пересчёт номинала, датированный кэш, объединение запросов, пауза повторов и проверка времени отправки проходят целевые проверки (31 в шаге автоматической политики) и браузер. См. [ответы](case-studies/issue-56/question-answers.md), [расчёты](case-studies/issue-56/salary-calculation.md) и [автоматические курсы](case-studies/issue-56/salary-exchange-policy.md). Накопительное обучение, зарплатные шаблоны, ответы с обеими налоговыми базами, остальные языки/формы и полное покрытие провайдеров открыты.",
    ".zh": "部分完成：共享规则、批准、修正/等价、拒绝措辞、摘要事实、上下文、独立薪酬目标及可配置税率已有 CLI/API/UI 回归和截图。显式和自动获取俄罗斯央行汇率、报价数量换算、日期缓存恢复、合并请求、重试退避与发送时钟检查通过定向验证（自动策略阶段 31 项）和浏览器测试。参见[问答](case-studies/issue-56/question-answers.md)、[计算](case-studies/issue-56/salary-calculation.md)及[自动汇率](case-studies/issue-56/salary-exchange-policy.md)。累计学习、薪酬占位符、同时说明税前税后、更多语言/表单及完整平台功能仍未完成。",
    ".hi": "आंशिक: साझा नियम, मंज़ूरी, सुधार/समानता, निषिद्ध शब्दावली, सारांश तथ्य, संदर्भ, स्वतंत्र वेतन लक्ष्य और विन्यास योग्य कर के CLI/API/UI परीक्षण व स्क्रीनशॉट हैं। केंद्रीय बैंक से स्पष्ट और स्वचालित दर प्राप्ति, उद्धृत इकाइयों का रूपांतरण, दिनांकित कैश, साझा अनुरोध, पुनःप्रयास विराम और भेजते समय घड़ी-जांच के केंद्रित परीक्षण (स्वचालित नीति चरण में 31) व ब्राउज़र जांच सफल हैं। [प्रश्नोत्तर](case-studies/issue-56/question-answers.md), [गणना](case-studies/issue-56/salary-calculation.md) व [स्वचालित दरें](case-studies/issue-56/salary-exchange-policy.md) देखें। संचयी सीखना, वेतन प्लेसहोल्डर, कर-पूर्व/बाद दोनों उत्तर, अन्य भाषा/फ़ॉर्म और पूर्ण प्रदाता समानता खुली हैं।",
}
for suffix, state in states.items():
    path = root / f"docs/REQUIREMENTS{suffix}.md"
    lines = path.read_text().splitlines()
    found = 0
    for index, line in enumerate(lines):
        if "| R-AA1 " in line:
            columns = line.split("|")
            columns[3] = f" {state} "
            lines[index] = "|".join(columns)
            found += 1
    assert found == 1, path
    path.write_text("\n".join(lines) + "\n")

path = root / "docs/case-studies/issue-56/reference-feature-inventory.md"
lines = path.read_text().splitlines()
for index, line in enumerate(lines):
    if line.startswith("| QA28 |"):
        lines[index] = "| QA28 | Fetch, normalize and cache dated exchange rates; recover from failed fetches without treating missing or stale rates as current. | [x] Shared mechanism: explicit/automatic primary CBR refresh, normalized lots, dated-cache fallback, coalescing/backoff and current-clock delivery pass focused checks (31 automatic-policy cases), CLI/both Lino APIs, production Chromium and independent MCP. This does not close provider/form parity. See [exchange recovery](salary-exchange.md) and [automatic policy](salary-exchange-policy.md). |"
path.write_text("\n".join(lines) + "\n")
