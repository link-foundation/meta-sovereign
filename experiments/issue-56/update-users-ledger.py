"""Record verified TG03–TG05 coverage and correct the Telegram requirement row."""
from pathlib import Path

root = Path(__file__).resolve().parents[2]
updates = {
    "": "TG03–TG05 now provide provenance-aware participant/history users, default read-only contact previews, exclusions, limits, no-phone additions and separate phone-sharing consent through CLI/default Lino API/shared Chat/Operator. 63 focused checks, production Chrome and independent MCP desktop/mobile evidence pass; immutable one-use plans, cancellation, actual receipts and durable unknown-write protection are covered. See [Telegram users](case-studies/issue-56/telegram-users.md). TG06–TG10 and exhaustive provider/device parity remain open.",
    ".ru": "TG03–TG05: пользователи с источниками из участников/истории, предпросмотр контактов без записи по умолчанию, исключения, лимиты, добавление без номера и отдельное согласие на раскрытие номера доступны через CLI/Lino API/общий Chat/Operator. Успешны 63 целевые проверки, Chrome и независимый MCP на большом/мобильном экране; проверены одноразовые планы, отмена, подтверждения и защита неопределённых записей. См. [пользователи Telegram](case-studies/issue-56/telegram-users.md). TG06–TG10 и полная поддержка провайдеров/устройств открыты.",
    ".hi": "TG03–TG05 में participant/history स्रोतों वाले उपयोगकर्ता, डिफ़ॉल्ट केवल-पठन contact preview, exclusions, limits, बिना फ़ोन संपर्क जोड़ना और अलग phone-sharing सहमति CLI/Lino API/साझा Chat/Operator से उपलब्ध हैं। 63 केंद्रित जाँच, Chrome और स्वतंत्र desktop/mobile MCP सफल; एक-बार योजनाएँ, cancellation, वास्तविक receipts और स्थायी unknown-write सुरक्षा सत्यापित हैं। [Telegram users](case-studies/issue-56/telegram-users.md) देखें। TG06–TG10 तथा पूर्ण provider/device parity अधूरी हैं।",
    ".zh": "TG03–TG05 已通过 CLI/默认 Lino API/共用 Chat/Operator 提供带成员及历史来源的用户收集、默认只读联系人预览、排除项、上限、无需电话号码的添加及独立号码共享授权。63 项定向检查、Chrome 和独立桌面/移动 MCP 通过；覆盖一次性冻结计划、取消、真实回执及持久未知写入保护。见 [Telegram 用户](case-studies/issue-56/telegram-users.md)。TG06–TG10 和全部提供方/设备功能仍未完成。",
}
for suffix, addition in updates.items():
    path = root / f"docs/REQUIREMENTS{suffix}.md"
    lines = path.read_text().splitlines()
    moved = ""
    for index, line in enumerate(lines):
        if line.startswith("| R-AA7 "):
            cells = line.split("|")
            if "TG01–TG02" in cells[3]:
                cells[3], moved = cells[3].split("TG01–TG02", 1)
                moved = "TG01–TG02" + moved.rstrip()
                lines[index] = "|".join(cells)
    for index, line in enumerate(lines):
        if line.startswith("| R-AA8 "):
            cells = line.split("|")
            if moved and "telegram-export.md" not in cells[3]:
                cells[3] = f" {moved} "
            cells[3] = cells[3].replace("TG03–TG10", "TG06–TG10")
            if "telegram-users.md" not in cells[3]:
                cells[3] = f"{cells[3].rstrip()} {addition} "
            lines[index] = "|".join(cells)
    path.write_text("\n".join(lines) + "\n")

path = root / "docs/case-studies/issue-56/reference-feature-inventory.md"
evidence = {
    "TG03": "[x] Shared CLI/Lino API/Chat/Operator scan merges participants, authors, service events, forwards, ID/username mentions and shared contacts with provenance, bounded evidence and explicit partial coverage. Installed SDK iterator regression, pagination/capacity and Chrome/MCP; telegram-users.md.",
    "TG04": "[x] Default read-only preview excludes ineligible/unresolved users; immutable expiring one-use plans bind account/people/options. Limits, eligibility rechecks, one flood retry, cancellation and durable unknown-write protection; 63 focused checks and production browser; telegram-users.md.",
    "TG05": "[x] Empty-phone MTProto AddContact, separate default-off privacy exception, actual Updates receipts and missing-receipt/transport uncertainty across fresh plans and restarts. Shared controls and desktop/mobile evidence; telegram-users.md.",
}
lines = path.read_text().splitlines()
for index, line in enumerate(lines):
    for key, value in evidence.items():
        if line.startswith(f"| {key} "):
            cells = line.split("|")
            cells[3] = f" {value} "
            lines[index] = "|".join(cells)
path.write_text("\n".join(lines) + "\n")

path = root / "docs/case-studies/issue-56/PLAN.md"
text = path.read_text()
start = text.index("Current focused work:")
end = text.index("\n\n", start)
text = text[:start] + "Current focused work: TG01–TG05 now cover exact/migrated/active history export, provenance-aware user scans and reviewed no-phone contact import through CLI/default Lino API/shared Chat/Operator. The user/contact slice passes 63 focused checks, production Chrome and independent MCP desktop/mobile review; see telegram-users.md. Immutable plans, actual receipts, cancellation and durable uncertain-write protection are covered. All five workflows for f42c4c46 passed. Export head 124a2234 passes four auxiliary workflows but Checks fails Windows Deno initial rolling-host readiness and WebKit profile-extras older sent birthday wishes. Complete workflow/job logs and browser artifacts are preserved; investigate root causes and verify the next exact head. Continue TG06–TG10 and every remaining issue-wide workstream. PR 57 stays draft and unmerged." + text[end:]
text = text.replace("- [x] Reproduce the two discovery assertions locally and verify their fixture correction.", "- [x] Reproduce the earlier discovery assertions locally and verify their fixture correction.\n- [x] Preserve 124a2234 Windows Deno and WebKit failures with exact SHA/timestamps.\n- [ ] Diagnose Windows rolling-host startup and WebKit older-wishes selection before any timing changes.")
path.write_text(text)

# Keep the older replayable collector from writing export evidence to broadcast.
path = root / "experiments/issue-56/update-export-ledger.py"
path.write_text(path.read_text().replace('line.startswith("| R-AA7 ")', 'line.startswith("| R-AA8 ")'))
