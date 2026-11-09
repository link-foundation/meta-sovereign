"""Record the bounded salary implementation without closing issue-wide criteria."""
from pathlib import Path

root = Path(__file__).resolve().parents[2]
updates = {
    "": " Configured independent monthly targets, hourly rounding, related follow-ups and unique containing bands now share CLI/API/UI; see [salary evidence](case-studies/issue-56/question-salary.md). Tax/FX math, learned-salary contraction, forms and full reference parity remain open.",
    ".ru": " Заданные месячные суммы, почасовое округление, связанные уточнения и единственная подходящая вилка доступны через CLI/API/UI: [зарплатные проверки](case-studies/issue-56/question-salary.md). Налоги/курсы, обучение зарплатным шаблонам, формы и остальное покрытие остаются открытыми.",
    ".zh": " 独立月薪目标、时薪取整、相关追问和唯一匹配薪资区间现已通过 CLI/API/UI 提供；参见[薪酬证据](case-studies/issue-56/question-salary.md)。税额/汇率计算、薪酬模板学习、表单及完整来源功能仍未完成。",
    ".hi": " स्वतंत्र मासिक लक्ष्य, प्रति घंटे पूर्णांकन, संबंधित अनुवर्ती प्रश्न और एकमात्र उपयुक्त सीमा अब CLI/API/UI में हैं; [वेतन प्रमाण](case-studies/issue-56/question-salary.md)। कर/विनिमय गणना, वेतन टेम्पलेट सीखना, फ़ॉर्म और पूर्ण संदर्भ समानता अभी खुली हैं।",
}
for suffix, addition in updates.items():
    path = root / f"docs/REQUIREMENTS{suffix}.md"
    lines = path.read_text().splitlines()
    for index, line in enumerate(lines):
        if "| R-AA1 " in line and "question-salary.md" not in line:
            lines[index] = line.rstrip().removesuffix("|").rstrip() + addition + " |"
    path.write_text("\n".join(lines) + "\n")

path = root / "docs/case-studies/issue-56/reference-feature-inventory.md"
replacements = {
    "| QA10 |": "[ ] Partial: all components assembled for review, including configured salary answers; contact extraction and advanced alignment remain.",
    "| QA12 |": "[ ] Partial: independent configured currency/net/gross/period targets, bounded context and related follow-ups pass CLI/API/UI; both-basis wording and full context parity remain.",
    "| QA13 |": "[ ] Partial: current targets replace plain stale amounts; decimal hours/upward steps and detailed-answer review pass shared regressions. Learned-literal contraction and tax/FX math remain.",
    "| QA15 |": "[ ] Partial: unique containing scaled bands, currency/basis/period guards and overlap/gap review pass shared tests; real provider buttons/forms remain.",
}
lines = path.read_text().splitlines()
for index, line in enumerate(lines):
    for prefix, status in replacements.items():
        if line.startswith(prefix):
            columns = line.split("|")
            columns[3] = f" {status} "
            lines[index] = "|".join(columns)
path.write_text("\n".join(lines) + "\n")
