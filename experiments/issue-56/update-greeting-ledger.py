"""Record the verified TG07/TG08 slice without closing the group criteria."""
from pathlib import Path

root = Path(__file__).resolve().parents[2]
updates = {
    "REQUIREMENTS.md": (
        "Chosen-target sending and TG07/TG09/TG10 remain unfinished.",
        "TG07/TG08 now share reviewed bot startup and chosen-target greeting sends through CLI/Lino API/UI, with immutable account/typed-target plans, positive receipts, durable uncertain outcomes and rolling 24-hour deduplication. 53 focused core checks, 45 model/Greetings/locale checks, 57 existing compatibility checks, production Chromium and independent desktop/mobile MCP pass. TG09/TG10 group eligibility, limits, pacing and progress remain unfinished.",
    ),
    "REQUIREMENTS.ru.md": (
        "Отправка выбранному адресату и TG07/TG09/TG10 не завершены.",
        "TG07/TG08: запуск выбранного бота и приветствие выбранного адресата доступны через CLI/Lino API/UI с неизменяемыми планами аккаунта и типа адресата, подтверждениями Telegram, постоянной защитой неопределённых исходов и интервалом 24 часа. Успешны 53 целевые основные проверки, 45 проверок модели/Greetings/локалей, 57 существующих проверок совместимости, Chromium и независимый MCP на большом/мобильном экране. TG09/TG10: отбор участников, лимиты, темп и прогресс групповой отправки не завершены.",
    ),
    "REQUIREMENTS.zh.md": (
        "指定目标发送及 TG07/TG09/TG10 仍未完成。",
        "TG07/TG08 已通过 CLI/Lino API/UI 提供审核后的机器人启动及指定目标问候，冻结账户和目标类型，要求 Telegram 回执，持久保留不确定结果并执行滚动 24 小时去重。53 项核心、45 项模型/Greetings/语言、57 项既有兼容检查、Chromium 及独立桌面/移动 MCP 通过。TG09/TG10 成员筛选、数量限制、发送节奏及进度仍未完成。",
    ),
    "REQUIREMENTS.hi.md": (
        "चुने लक्ष्य को भेजना तथा TG07/TG09/TG10 अधूरे हैं।",
        "TG07/TG08 में समीक्षा के बाद चुने बॉट को शुरू करना और चुने लक्ष्य को अभिवादन भेजना CLI/Lino API/UI से उपलब्ध है। खाते तथा लक्ष्य के प्रकार की अपरिवर्तनीय योजनाएँ, Telegram receipts, अनिश्चित परिणामों का स्थायी संरक्षण और पिछले 24 घंटों का दोहराव-रोध शामिल हैं। 53 मुख्य, 45 model/Greetings/locale तथा 57 मौजूदा compatibility जाँच, Chromium और स्वतंत्र desktop/mobile MCP सफल हैं। TG09/TG10 के सदस्य चयन, सीमा, गति तथा प्रगति अधूरे हैं।",
    ),
}
for name, (old, new) in updates.items():
    path = root / "docs" / name
    lines = path.read_text().splitlines()
    for index, line in enumerate(lines):
        if line.startswith("| R-AA8 "):
            if old in line:
                lines[index] = line.replace("TG07–TG10", "TG09–TG10").replace(old, new)
            elif new not in line:
                raise ValueError(f"Missing expected evidence in {name}")
    path.write_text("\n".join(lines) + "\n")

inventory = root / "docs/case-studies/issue-56/reference-feature-inventory.md"
text = inventory.read_text()
text = text.replace("[ ] Common send controls and CLI example.", "[x] Reviewed bot startup through CLI/Lino API/common UI, exact targets and positive receipts; CLI examples and evidence in telegram-greetings.md.")
text = text.replace("[ ] Discovery/cache now verified through CLI/Lino API/common UI; chosen-target greeting delivery still open. See telegram-greetings.md.", "[x] Discovery/cache and reviewed chosen-target delivery through CLI/Lino API/common UI, frozen documents and positive receipts. See telegram-greetings.md.")
inventory.write_text(text)
