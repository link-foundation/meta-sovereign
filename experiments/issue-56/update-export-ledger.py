"""Append verified Telegram export coverage without replacing broader scope."""
from pathlib import Path

root = Path(__file__).resolve().parents[2]
updates = {
    "": "TG01–TG02 now include exact peer resolution, complete/migrated history, bounded active-conversation discovery and linked Markdown/JSON with actual media through CLI/Lino API/shared Chat/Operator UI. 12 new and 12 existing focused checks, production Chrome, failing-before migration/mobile regressions and independent MCP pass; see [Telegram export](case-studies/issue-56/telegram-export.md). TG03–TG10 and exhaustive provider/device parity remain open.",
    ".ru": "TG01–TG02: точный выбор чата, полная история с миграцией, поиск активной беседы и связанные Markdown/JSON с медиа доступны через CLI/Lino API/общий интерфейс Chat/Operator. Успешны 12 новых и 12 прежних целевых проверок, Chrome, регрессии миграции/мобильной вёрстки и независимый MCP: [экспорт Telegram](case-studies/issue-56/telegram-export.md). TG03–TG10 и полная поддержка провайдеров/устройств остаются открытыми.",
    ".hi": "TG01–TG02 में सटीक chat पहचान, migration सहित पूरा इतिहास, सीमित active-conversation खोज तथा वास्तविक media वाले linked Markdown/JSON अब CLI/Lino API/साझा Chat/Operator UI से उपलब्ध हैं। 12 नई व 12 पुरानी केंद्रित जाँच, Chrome, migration/mobile regressions और स्वतंत्र MCP सफल; [Telegram export](case-studies/issue-56/telegram-export.md)। TG03–TG10 तथा संपूर्ण provider/device parity अधूरी हैं।",
    ".zh": "TG01–TG02 已通过 CLI/Lino API/共用 Chat/Operator UI 提供精确聊天定位、含迁移前记录的完整历史、有界活动会话查找及附真实媒体的关联 Markdown/JSON。12 项新增和 12 项既有定向检查、Chrome、迁移/移动布局回归及独立 MCP 通过；见 [Telegram 导出](case-studies/issue-56/telegram-export.md)。TG03–TG10 和全部提供方/设备功能仍未完成。",
}
for suffix, addition in updates.items():
    path = root / f"docs/REQUIREMENTS{suffix}.md"
    lines = path.read_text().splitlines()
    for index, line in enumerate(lines):
        if line.startswith("| R-AA8 "):
            cells = line.split("|")
            if "telegram-export.md" not in cells[3]:
                cells[3] = f"{cells[3].rstrip()} {addition} "
            lines[index] = "|".join(cells)
    path.write_text("\n".join(lines) + "\n")

path = root / "docs/case-studies/issue-56/reference-feature-inventory.md"
evidence = {
    "TG01": "[x] Exact IDs/usernames/t.me links, active gap (four-hour default), all history and accessible group migration share CLI/Lino API/Chat/Operator. Frozen bounds, deleted-marker migration and partial access failure regressions; telegram-export.md.",
    "TG02": "[x] Streaming linked Markdown/compact JSON parts stay within 1500 physical lines, including wrappers and oversized-message continuation; actual media, source IDs, timestamps/service details and honest failure notes. 12 new/12 existing checks, Chrome/MCP and mobile before/after; telegram-export.md.",
}
lines = path.read_text().splitlines()
for index, line in enumerate(lines):
    for key, value in evidence.items():
        if line.startswith(f"| {key} "):
            cells = line.split("|")
            cells[3] = f" {value} "
            if key == "TG01" and "pre-migration" not in cells[2]:
                cells[2] = cells[2].rstrip() + " Includes accessible pre-migration history. "
            lines[index] = "|".join(cells)
path.write_text("\n".join(lines) + "\n")

path = root / "docs/case-studies/issue-56/PLAN.md"
text = path.read_text()
start = text.index("Current focused work:")
end = text.index("\n\n", start)
text = text[:start] + "Current focused work: TG01–TG02 exact chat selection, complete/migrated history, active conversation discovery and bounded linked Markdown/JSON with media now share CLI/default Lino API/Chat/Operator controls; see telegram-export.md. Twelve new and twelve existing focused checks, production Chrome, independent MCP and failing-before migration/mobile comparisons pass. Saved publication controls and the tutorial measurement correction remain preserved. The exact-head f42c4c46 CI has passed all four auxiliary workflows and every completed Checks job; WebKit is still running at collection. Continue TG03–TG10 user/contact/login/greeting audit and implementation, follow/VK workflows, and all remaining question/HH/device criteria. Every issue-wide workstream stays open and PR 57 stays draft." + text[end:]
path.write_text(text)
