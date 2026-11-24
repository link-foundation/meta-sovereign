"""Record saved publication controls without declaring exhaustive issue parity."""
from pathlib import Path

root = Path(__file__).resolve().parents[2]
statuses = {
    "": "Saved Telegram/VK/X destinations, explicit credential modes, masked setup, read-only identity probes, confirmed publication/deletion, retained receipts and pending reload recovery now share CLI/default Lino API/UI controls. 56 focused checks, 31 Telegram compatibility checks, 3 ownership checks, production Chrome and independent MCP; see [saved publications](case-studies/issue-56/saved-publications.md). Exhaustive reference audit and wider provider/device workflows remain open.",
    ".ru": "Сохранённые адресаты Telegram/VK/X, явные режимы авторизации, скрытый ввод, проверка личности без публикации, подтверждённая публикация/удаление, квитанции и восстановление после перезагрузки доступны через CLI/Lino API/UI. 56 целевых проверок, 31 проверка Telegram, 3 проверки владения ресурсами, Chrome и независимый MCP: [публикации](case-studies/issue-56/saved-publications.md). Полный аудит источников и остальные сценарии провайдеров/устройств остаются открытыми.",
    ".zh": "保存 Telegram/VK/X 目标、明确认证模式、隐藏凭据输入、只读身份检查、确认发布/删除、保留回执和重载恢复已统一到 CLI/默认 Lino API/UI。56 项定向检查、31 项 Telegram 兼容检查、3 项资源释放检查及 Chrome/独立 MCP 通过；见[保存的发布](case-studies/issue-56/saved-publications.md)。全面源码审计及其余提供方/设备流程仍未完成。",
    ".hi": "सहेजे Telegram/VK/X लक्ष्य, स्पष्ट प्रमाणीकरण मोड, छिपा credential input, केवल-पठन पहचान जाँच, पुष्टि सहित प्रकाशन/हटाना, सुरक्षित receipts और reload recovery अब CLI/डिफ़ॉल्ट Lino API/UI से उपलब्ध हैं। 56 केंद्रित जाँच, 31 Telegram संगतता जाँच, 3 resource cleanup जाँच, Chrome तथा स्वतंत्र MCP सफल; [सहेजे प्रकाशन](case-studies/issue-56/saved-publications.md)। संपूर्ण स्रोत समीक्षा और बाकी provider/device workflows खुले हैं।",
}
for suffix, status in statuses.items():
    path = root / f"docs/REQUIREMENTS{suffix}.md"
    lines = path.read_text().splitlines()
    for index, line in enumerate(lines):
        if line.startswith("| R-AA7 "):
            cells = line.split("|")
            cells[3] = f" {status} "
            lines[index] = "|".join(cells)
        elif not suffix and line.startswith("| R-B4 "):
            cells = line.split("|")
            cells[3] = " Implemented saved Telegram/VK/X public destinations, confirmed lifecycle/history and credential modes; see PUBLISHING.md. Wider provider parity remains tracked by R-AA7. "
            lines[index] = "|".join(cells)
    path.write_text("\n".join(lines) + "\n")

evidence = {
    "BC01": "[x] Saved selected/all Telegram channels/groups, VK walls and X use one confirmed plan, per-target receipts and honest batch outcomes through CLI/Lino API/UI; offline four-destination regression and Chrome/MCP. See saved-publications.md.",
    "BC02": "[x] Bot preference, explicit bot/user modes, HTML/plain, multipart IDs and existing user login/2FA/session controls share saved destinations. 31 Telegram compatibility checks plus lifecycle/browser coverage; provider-publications.md and saved-publications.md.",
    "BC03": "[x] Separate user/community credentials, signed/community authorship, validated wall kinds/IDs and actual permission errors are configurable through CLI/API/UI; target/provider regressions and Chrome/MCP. See saved-publications.md.",
    "BC04": "[x] Saved X automatic/OAuth 1.0a/OAuth 2.0 user/app-only modes share CLI/API/UI; read-only credentials cannot publish. Universal signing/receipt checks and saved-controls browser coverage; x-publishing-auth.md and saved-publications.md.",
    "BC05": "[x] Durable per-target history retains checked provider IDs, original routing/auth mode and confirmed deletion acknowledgements. Unknown deletion blocks repetition. CLI/API/UI regressions and Chrome; saved-publications.md.",
    "BC06": "[x] Read-only identity tests and default-off bounded metadata diagnostics are available through CLI/API/UI, without credentials/content in diagnostic events; service/route/browser/MCP evidence in saved-publications.md.",
    "BC07": "[x] Separate environment/local credentials, presence-only reads, private file import, masked interactive CLI setup, blank-preserving UI and explicit clear are verified through shared tests/browser; saved-publications.md.",
}
path = root / "docs/case-studies/issue-56/reference-feature-inventory.md"
lines = path.read_text().splitlines()
for index, line in enumerate(lines):
    for key, value in evidence.items():
        if line.startswith(f"| {key} "):
            cells = line.split("|")
            cells[3] = f" {value} "
            lines[index] = "|".join(cells)
path.write_text("\n".join(lines) + "\n")
