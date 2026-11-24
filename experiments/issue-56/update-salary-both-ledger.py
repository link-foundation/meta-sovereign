"""Record the verified dual-basis mechanism, leaving provider parity open."""
from pathlib import Path

root = Path(__file__).resolve().parents[2]
edits = {
    "": ("both-basis wording, ", " [Both-basis answers](case-studies/issue-56/salary-both.md) pass 26 focused checks and browser verification."),
    ".ru": ("ответы с обеими налоговыми базами, ", " [Ответы до и после налогов](case-studies/issue-56/salary-both.md) проходят 26 целевых проверок и браузер."),
    ".zh": ("同时说明税前税后、", " [税前税后回答](case-studies/issue-56/salary-both.md)通过 26 项定向检查和浏览器验证。"),
    ".hi": ("कर-पूर्व/बाद दोनों उत्तर, ", " [कर-पूर्व/बाद दोनों उत्तर](case-studies/issue-56/salary-both.md) के 26 केंद्रित परीक्षण और ब्राउज़र जांच सफल हैं।"),
}
for suffix, (remove, evidence) in edits.items():
    path = root / f"docs/REQUIREMENTS{suffix}.md"
    lines = path.read_text().splitlines()
    for index, line in enumerate(lines):
        if "| R-AA1 " in line:
            columns = line.split("|")
            columns[3] = columns[3].replace(remove, "").rstrip() + evidence + " "
            lines[index] = "|".join(columns)
    path.write_text("\n".join(lines) + "\n")

path = root / "docs/case-studies/issue-56/reference-feature-inventory.md"
lines = path.read_text().splitlines()
for index, line in enumerate(lines):
    if line.startswith("| QA12 |"):
        lines[index] = line.replace("both-basis wording and full context parity remain.", "both-basis wording passes 26 focused salary cases and production browser/MCP. Full context/provider parity remains. See [both-basis evidence](salary-both.md).")
    elif line.startswith("| QA13 |"):
        lines[index] = line.replace("learned-literal contraction and rate fetching/cache recovery remain.", "automatic dated FX/cache recovery is verified separately. Learned-literal contraction remains.")
    elif line.startswith("| QA27 |"):
        lines[index] = "| QA27 | Independent net targets, progressive annual personal tax, whole-income company bands, compound payout tax and upward monthly/hourly rounding. | [x] Shared calculation mechanism: owner-configured schedules/methods, cross-currency thresholds and explicit both-basis wording pass focused regressions (26 in the both-basis step), CLI/both Lino APIs, production Chromium and MCP. Provider/form workflows remain separately required. See [calculation](salary-calculation.md) and [both-basis evidence](salary-both.md). |"
path.write_text("\n".join(lines) + "\n")
