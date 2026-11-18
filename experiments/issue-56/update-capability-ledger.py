"""Record the tested capability gap without closing broader mobile requirements."""
from pathlib import Path

root = Path(__file__).resolve().parents[2]
updates = {
    "": " Telegram status now advertises actual notification/account-event availability; the shared browser bridge suppresses unavailable operations and recovers capability changes. See [capability evidence](case-studies/issue-56/telegram-capabilities.md). Full mobile/provider capability coverage remains open.",
    ".ru": " Статус Telegram теперь сообщает фактическую доступность уведомлений и событий аккаунтов; общий браузерный слой не вызывает недоступные операции и учитывает изменения возможностей. См. [проверки возможностей](case-studies/issue-56/telegram-capabilities.md). Полное покрытие мобильных устройств и провайдеров остаётся открытым.",
    ".zh": " Telegram 状态现报告通知和账号事件的实际可用性；共享浏览器层跳过不可用操作并响应能力变化。参见[能力验证](case-studies/issue-56/telegram-capabilities.md)。完整移动端和供应商能力覆盖仍未完成。",
    ".hi": " Telegram स्थिति अब सूचनाओं और खाता घटनाओं की वास्तविक उपलब्धता बताती है; साझा ब्राउज़र परत अनुपलब्ध काम रोकती है और क्षमता बदलने पर अनुकूल होती है। [क्षमता प्रमाण](case-studies/issue-56/telegram-capabilities.md)। पूर्ण मोबाइल और प्रदाता कवरेज अभी खुली है।",
}
for suffix, addition in updates.items():
    path = root / f"docs/REQUIREMENTS{suffix}.md"
    lines = path.read_text().splitlines()
    for index, line in enumerate(lines):
        if "| R-AA23 " in line and "telegram-capabilities.md" not in line:
            lines[index] = line.rstrip().removesuffix("|").rstrip() + addition + " |"
    path.write_text("\n".join(lines) + "\n")
