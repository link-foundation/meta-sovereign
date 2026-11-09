"""Record verified calculation coverage without closing the wider Q/A criterion."""
from pathlib import Path

root = Path(__file__).resolve().parents[2]
states = {
    "": "Partial: shared scoped/approved rules, canonical corrections/equivalence, rejected wording, zero-count summary facts, configured contexts, independent salary targets and progressive/company/payout calculations with dated rate snapshots have CLI/API/UI regressions and screenshots. See [Q/A](case-studies/issue-56/question-answers.md), [policy](case-studies/issue-56/question-policy.md), [context](case-studies/issue-56/question-context.md) and [calculation evidence](case-studies/issue-56/salary-calculation.md). Cumulative archive learning, salary placeholder contraction, rate fetching/cache recovery, wider language/form and full provider parity remain open.",
    ".ru": "Частично: общие правила с областью действия и одобрением, канонические исправления, эквивалентность, запрет формулировок, факты из итогов с нулевым счётчиком, контексты, независимые зарплатные суммы и личные/корпоративные налоги с налогом на выплату и курсами с датой проверены через CLI/API/UI со снимками. См. [ответы](case-studies/issue-56/question-answers.md), [политику](case-studies/issue-56/question-policy.md), [контекст](case-studies/issue-56/question-context.md) и [расчёты](case-studies/issue-56/salary-calculation.md). Накопительное обучение, зарплатные шаблоны, загрузка/кэш курсов, остальные языки, формы и полное покрытие провайдеров остаются открытыми.",
    ".zh": "部分完成：共享作用域/批准规则、规范修正和等价、拒绝措辞、零计数摘要事实、上下文、独立薪酬目标及个人累进税/公司与分配税计算和带日期汇率已有 CLI/API/UI 回归和截图。参见[问答](case-studies/issue-56/question-answers.md)、[策略](case-studies/issue-56/question-policy.md)、[上下文](case-studies/issue-56/question-context.md)及[计算证据](case-studies/issue-56/salary-calculation.md)。累计历史学习、薪酬占位符提取、汇率获取/缓存恢复、更多语言与表单及完整平台功能仍未完成。",
    ".hi": "आंशिक: साझा दायरे/मंज़ूरी वाले नियम, मानक सुधार व समानता, निषिद्ध शब्दावली, शून्य-गणना सारांश तथ्य, संदर्भ, स्वतंत्र वेतन लक्ष्य और व्यक्तिगत/कंपनी व वितरण कर गणना तथा दिनांकित दरों के CLI/API/UI परीक्षण और स्क्रीनशॉट हैं। [प्रश्नोत्तर](case-studies/issue-56/question-answers.md), [नीति](case-studies/issue-56/question-policy.md), [संदर्भ](case-studies/issue-56/question-context.md) और [गणना प्रमाण](case-studies/issue-56/salary-calculation.md) देखें। संचयी इतिहास सीखना, वेतन प्लेसहोल्डर, दर प्राप्ति/कैश पुनर्प्राप्ति, अन्य भाषाएं/फ़ॉर्म और पूर्ण प्रदाता समानता खुली हैं।",
}
for suffix, state in states.items():
    path = root / f"docs/REQUIREMENTS{suffix}.md"
    lines = path.read_text().splitlines()
    for index, line in enumerate(lines):
        if "| R-AA1 " in line:
            columns = line.split("|")
            columns[3] = f" {state} "
            lines[index] = "|".join(columns)
    path.write_text("\n".join(lines) + "\n")

path = root / "docs/case-studies/issue-56/reference-feature-inventory.md"
text = path.read_text().replace(
    "Learned-literal contraction and tax/FX math remain.",
    "Explicit progressive/company/payout math and dated FX snapshots now pass shared checks; learned-literal contraction and rate fetching/cache recovery remain."
)
if "| QA27 |" not in text:
    marker = "\n## HH job applications, messaging and CV"
    rows = "\n| QA27 | Independent net targets, progressive annual personal tax, whole-income company bands, compound payout tax and upward monthly/hourly rounding. | [ ] Partial: owner-configured schedules/methods and cross-currency thresholds pass nine calculation/control cases, production Chromium and MCP; both-basis wording remains. See [calculation evidence](salary-calculation.md). |\n| QA28 | Fetch, normalize and cache dated exchange rates; recover from failed fetches without treating missing or stale rates as current. | [ ] Dated snapshots and freshness guards implemented; actual rate fetching/cache recovery remains. |\n"
    text = text.replace(marker, rows + marker)
path.write_text(text)
