import { noticeText, noticeReply } from './notice-fixture.mjs';

export const noticeTurn = ({
  source = 'hh',
  chat = 'notice',
  question = noticeText,
  answer = noticeReply,
  start = 0,
} = {}) =>
  [
    ['them', question],
    ['me', answer],
  ].map(([sender, body], index) => ({
    id: `msg:${source}:${chat}:${start + index + 1}`,
    source,
    chat,
    sender,
    body,
    timestamp: new Date(
      Date.UTC(2026, 10, 11, 12, 0, start + index)
    ).toISOString(),
  }));

export const archivedNoticeTurns = () =>
  ['hh', 'vk'].flatMap((source) => noticeTurn({ source }));

export const translatedNotices = [
  [
    'Мы рассмотрим ваше резюме и опыт.',
    'Здравствуйте! ',
    '\nС уважением,\nИрина',
  ],
  ['हम आपके आवेदन की समीक्षा करेंगे।', 'नमस्ते! ', '\nसादर,\nभर्तीकर्ता'],
  ['我们会审核您的申请。', '您好！', '\n此致，\n招聘人员'],
];
