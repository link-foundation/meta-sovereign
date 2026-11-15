const keys = [
  'acceptancePolicy',
  'ranked-batch',
  'desktop-ten-percent',
  'mutualOnlyAt',
  'desktopHint',
  'quota',
  'noMutual',
  'quotaSummary',
  'mutualCount',
];
const words = {
  en: [
    'Incoming acceptance policy',
    'Ranked batch',
    'Desktop: lifetime top ten percent',
    'Mutual-only threshold (1–10000)',
    'Desktop mode reserves ten percent of distinct incoming requesters observed by this account, ranked by mutual friends. Repeated reviews do not increase allowance. At or above the threshold only requests with mutual friends qualify. VK’s 10,000-friend hard limit still applies. Priority requests come first and do not spend this allowance; unknown attempts keep their reservation.',
    'Lifetime acceptance allowance exhausted',
    'No mutual friends above the threshold',
    '{observed} distinct requesters observed · {reserved} confirmed or reserved attempts · {available} remaining below-threshold allowance',
    '{count} mutual friends',
  ],
  ru: [
    'Правила приёма входящих',
    'Упорядоченный пакет',
    'Как в настольном приложении: десять процентов за всё время',
    'Порог только общих друзей (1–10000)',
    'Настольный режим резервирует десять процентов разных входящих заявителей этого аккаунта по числу общих друзей. Повторный просмотр не увеличивает квоту. Начиная с порога допускаются лишь заявки с общими друзьями. Жёсткий предел ВКонтакте — 10 000 друзей. Приоритетные заявки идут первыми и не расходуют квоту; неизвестные попытки сохраняют резерв.',
    'Квота приёма за всё время исчерпана',
    'Нет общих друзей при достигнутом пороге',
    'Разных заявителей: {observed} · подтверждено или зарезервировано: {reserved} · осталось ниже порога: {available}',
    'Общих друзей: {count}',
  ],
  hi: [
    'आने वाले अनुरोध स्वीकारने की नीति',
    'क्रमबद्ध बैच',
    'डेस्कटॉप: पूरे समय के शीर्ष दस प्रतिशत',
    'केवल साझा मित्रों की सीमा (1–10000)',
    'डेस्कटॉप मोड इस खाते में देखे गए अलग अनुरोधकर्ताओं के दस प्रतिशत को साझा मित्रों के क्रम में सुरक्षित रखता है। दोबारा समीक्षा से कोटा नहीं बढ़ता। सीमा पर या उससे ऊपर केवल साझा मित्रों वाले अनुरोध योग्य हैं। VK की 10,000 मित्रों की कठोर सीमा लागू रहती है। प्राथमिक अनुरोध पहले आते हैं और कोटा नहीं लेते; अज्ञात प्रयास आरक्षण रखते हैं।',
    'पूरे समय का स्वीकृति कोटा समाप्त',
    'सीमा के ऊपर कोई साझा मित्र नहीं',
    '{observed} अलग अनुरोधकर्ता देखे · {reserved} पुष्टि या आरक्षित प्रयास · सीमा के नीचे शेष कोटा {available}',
    '{count} साझा मित्र',
  ],
  zh: [
    '收到请求的接受规则',
    '排序批次',
    '桌面模式：累计前百分之十',
    '仅限共同好友的阈值（1–10000）',
    '桌面模式按共同好友排序，为此账户观察到的不同请求者保留百分之十的名额。重复审核不会增加名额。达到阈值后仅允许有共同好友的请求。VK 的一万好友硬性上限仍然有效。优先请求先处理且不消耗该名额；结果未知的尝试保留预留名额。',
    '累计接受名额已用完',
    '达到阈值且没有共同好友',
    '已观察 {observed} 位不同请求者 · 已确认或预留 {reserved} 次 · 阈值以下剩余名额 {available}',
    '{count} 位共同好友',
  ],
};
export const vkFriendPolicyLocale = (language) =>
  Object.fromEntries(
    keys.map((key, i) => [`vkFriends.${key}`, words[language][i]])
  );
