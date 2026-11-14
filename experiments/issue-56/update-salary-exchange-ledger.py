"""Record verified explicit rate refresh without closing unattended/provider work."""
from pathlib import Path

root = Path(__file__).resolve().parents[2]
states = {
    "": "Partial: shared scoped/approved rules, corrections/equivalence, rejected wording, summary facts, configured contexts, independent salary targets and personal/company/payout calculations with dated rates have CLI/API/UI regressions and screenshots. Explicit primary CBR refresh, normalized lots, dated-cache fallback and delivery-time expiry now pass 25 focused checks and browser verification. See [Q/A](case-studies/issue-56/question-answers.md), [calculation](case-studies/issue-56/salary-calculation.md) and [exchange evidence](case-studies/issue-56/salary-exchange.md). Cumulative archive learning, salary placeholders, unattended refresh policy, wider language/form and full provider parity remain open.",
    ".ru": "Частично: общие правила, одобрение, исправления, эквивалентность, запрет формулировок, факты из итогов, контексты, независимые зарплатные суммы и личные/корпоративные налоги с налогом на выплату и курсами проверены через CLI/API/UI со снимками. Явная загрузка ЦБ РФ, пересчёт номинала, кэш с датой и проверка срока перед отправкой проходят 25 тестов и проверку браузером. См. [ответы](case-studies/issue-56/question-answers.md), [расчёты](case-studies/issue-56/salary-calculation.md) и [курсы](case-studies/issue-56/salary-exchange.md). Накопительное обучение, зарплатные шаблоны, фоновое обновление курсов, остальные языки/формы и полное покрытие провайдеров открыты.",
    ".zh": "部分完成：共享规则、批准、修正/等价、拒绝措辞、摘要事实、上下文、独立薪酬目标及个人/公司与分配税计算和日期汇率已有 CLI/API/UI 回归和截图。显式获取俄罗斯央行汇率、按报价数量换算、日期缓存恢复及发送前过期检查通过 25 项测试和浏览器验证。参见[问答](case-studies/issue-56/question-answers.md)、[计算](case-studies/issue-56/salary-calculation.md)及[汇率证据](case-studies/issue-56/salary-exchange.md)。累计学习、薪酬占位符、无人值守刷新策略、更多语言/表单及完整平台功能仍未完成。",
    ".hi": "आंशिक: साझा नियम, मंज़ूरी, सुधार/समानता, निषिद्ध शब्दावली, सारांश तथ्य, संदर्भ, स्वतंत्र वेतन लक्ष्य तथा व्यक्तिगत/कंपनी व वितरण कर और दिनांकित दरों के CLI/API/UI परीक्षण व स्क्रीनशॉट हैं। केंद्रीय बैंक से स्पष्ट दर प्राप्ति, उद्धृत इकाइयों का रूपांतरण, दिनांकित कैश पुनर्प्राप्ति और भेजने से पहले अवधि-जांच के 25 परीक्षण व ब्राउज़र जांच सफल हैं। [प्रश्नोत्तर](case-studies/issue-56/question-answers.md), [गणना](case-studies/issue-56/salary-calculation.md) व [दर प्रमाण](case-studies/issue-56/salary-exchange.md) देखें। संचयी सीखना, वेतन प्लेसहोल्डर, स्वचालित ताज़ाकरण नीति, अन्य भाषा/फ़ॉर्म और पूर्ण प्रदाता समानता खुली हैं।",
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
        lines[index] = "| QA28 | Fetch, normalize and cache dated exchange rates; recover from failed fetches without treating missing or stale rates as current. | [ ] Partial: explicit primary CBR refresh, normalized lots, dated cache recovery and clock-aware delivery expiry pass 25 focused checks, CLI/both Lino APIs, production Chromium and independent MCP. Unattended refresh policy and full provider workflows remain. See [exchange evidence](salary-exchange.md). |"
text = "\n".join(lines).replace("\n\n| QA27 |", "\n| QA27 |")
path.write_text(text + "\n")
