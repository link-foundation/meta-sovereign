"""Record verified TG09/TG10 without closing other issue-wide criteria."""
from pathlib import Path

root = Path(__file__).resolve().parents[2]
updates = {
    'REQUIREMENTS.md': (
        ['TG09–TG10 and exhaustive provider/device parity remain open.'],
        'TG09/TG10 group eligibility, limits, pacing and progress remain unfinished.',
        'TG09/TG10 now share participant-only private greetings through CLI/Lino API/UI with requested account exclusions, visible business-profile checks, frozen per-person stickers, limits, 30-second default pacing, shared durable 24-hour/uncertain-outcome protection and acknowledged progress. 70 focused compatibility/core and 43 UI/locale checks, production Chromium and independent MCP desktop/mobile pass; see [group greetings](case-studies/issue-56/telegram-group-greetings.md). Full provider/device parity and every other open issue-wide criterion remain required.',
    ),
    'REQUIREMENTS.ru.md': (
        ['TG09–TG10 и полная поддержка провайдеров/устройств остаются открытыми.', 'TG09–TG10 и полная поддержка провайдеров/устройств открыты.'],
        'TG09/TG10: отбор участников, лимиты, темп и прогресс групповой отправки не завершены.',
        'TG09/TG10: личные приветствия только участникам группы доступны через CLI/Lino API/UI с исключением указанных типов аккаунтов, проверкой видимых бизнес-профилей, неизменяемыми стикерами для каждого получателя, лимитами и паузой 30 секунд по умолчанию. Сохраняются общая защита 24 часа/неопределённых исходов и прогресс после подтверждения. Успешны 70 целевых основных/совместимых и 43 проверки UI/локалей, Chromium и независимый MCP на большом/мобильном экране: [приветствия группы](case-studies/issue-56/telegram-group-greetings.md). Полная поддержка провайдеров/устройств и остальные открытые требования остаются обязательными.',
    ),
    'REQUIREMENTS.zh.md': (
        ['TG09–TG10 和全部提供方/设备功能仍未完成。'],
        'TG09/TG10 成员筛选、数量限制、发送节奏及进度仍未完成。',
        'TG09/TG10 已通过 CLI/Lino API/UI 提供仅针对群成员的私人问候，排除要求中的账户类型并检查可见商业资料，为每位收件人冻结贴纸，支持数量限制和默认 30 秒间隔，共享持久 24 小时/不确定结果保护，并在回执后保存进度。70 项核心/兼容及 43 项 UI/语言检查、Chromium 和独立桌面/移动 MCP 通过；见[群成员问候](case-studies/issue-56/telegram-group-greetings.md)。全部提供方/设备功能及其余开放要求仍须完成。',
    ),
    'REQUIREMENTS.hi.md': (
        ['TG09–TG10 तथा संपूर्ण provider/device parity अधूरी हैं।', 'TG09–TG10 तथा पूर्ण provider/device parity अधूरी हैं।'],
        'TG09/TG10 के सदस्य चयन, सीमा, गति तथा प्रगति अधूरे हैं।',
        'TG09/TG10 में केवल समूह सदस्यों को निजी अभिवादन CLI/Lino API/UI से उपलब्ध है। माँगे गए खाता प्रकार और दिखाई देने वाले business profiles बाहर रहते हैं; हर प्राप्तकर्ता का sticker समीक्षा में स्थिर रहता है। सीमा, डिफ़ॉल्ट 30 सेकंड का अंतराल, साझा स्थायी 24-hour/अनिश्चित-परिणाम सुरक्षा और receipt के बाद प्रगति शामिल हैं। 70 मुख्य/compatibility तथा 43 UI/locale जाँच, Chromium और स्वतंत्र desktop/mobile MCP सफल; [समूह अभिवादन](case-studies/issue-56/telegram-group-greetings.md)। संपूर्ण provider/device parity तथा सभी अन्य खुले मानदंड अभी भी आवश्यक हैं।',
    ),
}
for name, (stale, old, new) in updates.items():
    path = root / 'docs' / name
    lines = path.read_text().splitlines()
    for i, line in enumerate(lines):
        if line.startswith('| R-AA8 '):
            assert old in line or new in line, name
            for phrase in stale:
                line = line.replace(phrase, '')
            lines[i] = line.replace(old, new)
    path.write_text('\n'.join(lines) + '\n')

path = root / 'docs/case-studies/issue-56/reference-feature-inventory.md'
s = path.read_text().replace('[ ] Recipient planner.', '[x] Participant-only group/megagroup planner, requested exclusions and visible business checks through CLI/Lino API/common UI; telegram-group-greetings.md.')
s = s.replace('[ ] Existing greetings/outbox integration audit.', '[x] Frozen per-person stickers, limits, default 30-second pacing, shared rolling 24-hour/unknown-write protection and acknowledged progress; telegram-group-greetings.md.')
path.write_text(s)
