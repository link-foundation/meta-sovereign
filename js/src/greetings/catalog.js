/**
 * Greeting catalogue (issue #35): what each network can send to open
 * a dialog, and which stickers we offer out of the box.
 *
 * No artwork lives in this repository. Every sticker is referenced by
 * its network id plus a direct preview link served by the network
 * itself, so the UI can show it and the adapter can send it. Packs we
 * cannot enumerate in advance are listed live through the network's
 * API (`listGreetingStickers` in `./index.js`).
 */

/** VK serves a 512px PNG for any sticker id at this address. */
export const vkStickerPreview = (id, { background = false } = {}) =>
  `https://vk.com/sticker/1-${id}-512${background ? 'b' : ''}`;

/**
 * Greeting stickers from konard/vk-bot `stickers/greeting.json` and
 * `triggers/greeting.js` (public domain). `common` marks the set
 * vk-bot sends when it greets friends itself; the rest are packs whose
 * keywords include "привет"/"hi". Personalised vmoji (73601, 81995)
 * are left out: their previews are per-account `userapi.com` links.
 * Sending a sticker requires owning its pack — free packs are added
 * on first use from the VK sticker store.
 */
const VK_STICKERS = [
  // [sticker id, pack id, pack title, common]
  ['72789', 1536, 'Minty', true],
  ['3003', 94, "Let's Go!", true],
  ['76459', 1618, 'Veggies', true],
  ['73071', 1542, 'Bloop', true],
  ['51417', 1037, 'Kermit', true],
  ['72437', 1528, 'Toshi', true],
  ['69175', 1456, 'Umschool Level Up', true],
  ['4639', 148, 'Pushkin Is Our Everything', true],
  ['14409', 418, 'Froggy and Croaky', true],
  ['21', 1, 'Spotty', true],
  ['75306', 1593, 'Ice and Cream', true],
  ['73151', 1544, 'Ron and Ray', true],
  ['77664', 1645, 'Liza and Matvei', true],
  ['60062', 1240, 'Geckosha', true],
  ['134', 4, 'Fruitables', true],
  ['4917', 62, 'VK Fest', true],
  ['15346', 442, 'Vezunchik', true],
  ['79160', null, null, true],
  ['92708', 1981, 'Heartfelt stickers', true],
  ['84592', 1797, 'Tong', true],
  ['93953', 2007, 'F', false],
  ['59397', 1224, 'Dino', false],
  ['86510', 1843, 'Vladik', false],
  ['91881', 1961, 'Bengal and Somali', false],
  ['83320', 1769, 'Mark', false],
  ['90965', 1942, 'Froggy mix', false],
  ['56500', 1152, 'Yami', false],
  ['16821', 479, 'Gingerbread', false],
  ['91176', 1946, 'Michael', false],
  ['84235', 1788, 'Mary and Hide', false],
  ['85791', 1825, 'Muff', false],
  ['4275', 138, 'Poppy', false],
  ['79394', 1684, 'Chris', false],
  ['16263', 464, 'Ginger', false],
  ['12467', 367, 'Advocado', false],
  ['5785', 181, 'Little Evil', false],
  ['51117', 1030, 'Ramesses', false],
  ['8481', 263, 'Animated Senya', false],
  ['2418', 74, 'Senya', false],
  ['60566', 1252, 'Papa Gnome', false],
  ['7210', 221, 'Slavik', false],
  ['85081', null, 'Elinor', false],
  ['72168', null, 'Emily', false],
];

export const vkGreetingStickers = VK_STICKERS.map(
  ([id, packId, packTitle, common]) => ({
    network: 'vk',
    id,
    packId,
    packTitle,
    common,
    previewUrl: vkStickerPreview(id),
  })
);

/**
 * Stickers people greet *us* with on VK that are not in the catalogue
 * above (vk-bot `incomingGreetingStickersIds`). Only used to recognise
 * an incoming greeting, never sent.
 */
export const vkIncomingGreetingStickerIds = [
  '53610',
  '3462',
  '58052',
  '85099',
  '20341',
  '3952',
  '87057',
  '8472',
  '7878',
  '60272',
  '94193',
  '4323',
  '68335',
  '84541',
  '64785',
  '84236',
  '70753',
  '16029',
  '58732',
  '18035',
  '88693',
  '86108',
  '59666',
  '80788',
  '72459',
  '90653',
  '8695',
  '62694',
  '17722',
  '12115',
  '53098',
  '81248',
  '56896',
  '76436',
  '73705',
  '74558',
  '62800',
  '11510',
  '66363',
  '4501',
  '98390',
  '51259',
  '66087',
  '65253',
  '63426',
  '61829',
  '70784',
  '74108',
  '89004',
  '57279',
  '17952',
  '50644',
  '83820',
  '9469',
  '54474',
  '81995',
  '73601',
];

/** Greeting texts sent when a network (or the user) prefers words. */
export const greetingTexts = {
  en: ['Hi!', 'Hello!', 'Hey 👋', 'Hi there!'],
  ru: ['Привет!', 'Здравствуйте!', 'Привет 👋', 'Добрый день!'],
  zh: ['你好！', '您好！', '嗨 👋'],
  hi: ['नमस्ते!', 'नमस्कार!', 'हाय 👋'],
  vi: ['Xin chào!', 'Chào bạn!', 'Chào bạn 👋'],
};

/**
 * Telegram sticker sets offered for greeting. Bot API `file_id`s are
 * bot-specific, so the catalogue stores set *names* and the adapter
 * lists their 👋 stickers live with `getStickerSet`. Every name below
 * resolves on t.me/addstickers (checked 2026-10-11); a set without a
 * waving sticker simply contributes nothing to the live list.
 */
export const telegramGreetingSets = [
  'HotCherry',
  'UtyaDuck',
  'UtyaDuckFull',
  'AnimatedEmojies',
  'Animals',
  'Ghostie',
  'MrCat',
  'ChristmasCuties',
  'TheVirus',
  'Cherry',
].map((name) => ({ name, addUrl: `https://t.me/addstickers/${name}` }));

/**
 * The stickers Telegram apps suggest on an empty chat. They come from
 * the MTProto user API — the Bot API cannot reach them — so a user
 * client (TDLib, MTProto) is needed to list them.
 */
export const telegramDefaultGreetings = {
  method: 'messages.getStickers',
  emoticon: '👋⭐️',
  tdlib: 'getGreetingStickers',
  botApi: false,
  sources: [
    'https://github.com/DrKLO/Telegram/blob/master/TMessagesProj/src/main/java/org/telegram/messenger/MediaDataController.java',
    'https://github.com/telegramdesktop/tdesktop/blob/dev/Telegram/SourceFiles/api/api_premium.cpp',
    'https://github.com/tdlib/td/blob/master/td/generate/scheme/td_api.tl',
  ],
};

/**
 * Messenger's thumbs-up is always sendable and absent from the sticker
 * catalogue API, so it is the one Facebook sticker known in advance.
 */
export const facebookGreetingStickers = [
  {
    network: 'facebook',
    id: '369239263222822',
    packId: null,
    packTitle: 'Like',
    common: true,
    emoji: '👍',
    previewUrl: null,
  },
];

/**
 * What each messaging network can do when opening a dialog.
 *
 * - `sticker`: how a sticker is addressed, or null when the network
 *   has none (X DMs, email).
 * - `listing`: the API that enumerates stickers live, or null.
 * - `initiate`: `'yes'` — any known chat can be greeted;
 *   `'window'` — free-form messages only within `windowHours` of the
 *   contact's last message, a template is needed otherwise;
 *   `'reply-only'` — the account can only answer chats the contact
 *   opened (Telegram bots, which is every chat a bot knows about).
 */
export const greetingNetworks = {
  vk: {
    sticker: 'sticker_id',
    listing: 'store.getStickersKeywords',
    initiate: 'yes',
    note: 'VK error 901/902 when the contact does not accept messages.',
  },
  telegram: {
    sticker: 'file_id or .webp URL',
    listing: 'getStickerSet',
    initiate: 'reply-only',
    note: 'Bots cannot start conversations; the contact must write first.',
  },
  whatsapp: {
    sticker: 'media id or .webp link',
    listing: null,
    initiate: 'window',
    windowHours: 24,
    note: 'Outside the 24-hour window only approved templates can be sent.',
  },
  facebook: {
    sticker: 'sticker_id',
    listing: null,
    initiate: 'window',
    windowHours: 24,
    note: 'Only public first-party stickers, within the messaging window.',
  },
  zalo: {
    sticker: 'attachment_id',
    listing: null,
    initiate: 'window',
    windowHours: 48,
    note: 'Sticker ids come from stickers.zaloapp.com.',
  },
  x: {
    sticker: null,
    listing: null,
    initiate: 'yes',
    note: 'DMs carry text or one media item; no stickers.',
  },
  email: {
    sticker: null,
    listing: null,
    initiate: 'yes',
    note: 'Text only.',
  },
};

/** Built-in stickers grouped by network (Telegram is listed live). */
export const builtInGreetingStickers = {
  vk: vkGreetingStickers,
  facebook: facebookGreetingStickers,
};
