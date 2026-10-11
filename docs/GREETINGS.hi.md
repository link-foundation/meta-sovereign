# अभिवादन: hi या sticker से dialogs शुरू करें (languages: [en](GREETINGS.md) • [zh](GREETINGS.zh.md) • hi • [ru](GREETINGS.ru.md))

लोगों से बात करने में बातचीत शुरू करना ही सबसे धीमा और दोहराव वाला हिस्सा
है। [konard/vk-bot](https://github.com/konard/vk-bot) ने VK पर इसे इस तरह
हल किया: जिन friends को कभी लिखा नहीं गया था उन्हें greeting sticker भेजा,
और "Привет!" का जवाब sticker से दिया। यह subsystem वही काम हर उस messaging
network पर करता है जिससे `meta-sovereign` पहले से जुड़ा है, ताकि उपयोगकर्ता
का ध्यान पहले message पर नहीं, दूसरे message पर लगे।

संबंधित दस्तावेज़: [USER-GUIDE खंड 10](USER-GUIDE.hi.md#10-hi-या-sticker-से-लोगों-का-अभिवादन-करें),
[SERVER-PARITY](SERVER-PARITY.hi.md),
[issue 35 case study](case-studies/issue-35/README.md)।

## 1. परतें

| परत      | फ़ाइल                               | ज़िम्मेदारी                                                                                    |
| -------- | ----------------------------------- | ---------------------------------------------------------------------------------------------- |
| Catalog  | `js/src/greetings/catalog.js`       | Network capabilities, built-in stickers (ids + direct links), Telegram sets, texts।            |
| Detector | `js/src/greetings/detect.js`        | आया हुआ message अभिवादन है या नहीं, और किस भाषा में।                                           |
| Planner  | `js/src/greetings/plan.js`          | `planGreetings` / `planFromStore`: किसे और किस चीज़ से अभिवादन करना है। Pure और previewable।   |
| Runner   | `js/src/greetings/index.js`         | `runGreetings`: messages के बीच pause के साथ भेजता है, `greeting:<net>:<chat>` record करता है। |
| Adapters | `js/src/sources/{vk,telegram,…}.js` | `sticker` के साथ `live.post`, `listGreetingStickers`, Telegram `fetchFile`।                    |
| HTTP     | `js/src/server/routes-greetings.js` | `/api/greetings/*`, Telegram thumbnail proxy सहित।                                             |
| CLI      | `js/src/cli/greetings-commands.js`  | `greetings-stickers`, `greetings-select`, `greetings-plan`, `greetings-send`।                  |
| SPA      | `js/src/web/greetings-view.js`      | **अभिवादन** screen: stickers चुनें, plan का preview देखें, भेजें।                              |

## 2. Repository में कोई artwork नहीं

हर sticker network के अपने identifier और उस link के रूप में रखा जाता है
जिसे network खुद serve करता है:

- **VK** — `sticker_id`; preview है
  `https://vk.com/sticker/1-<id>-512`। 43 built-in ids vk-bot की
  `stickers/greeting.json` से आते हैं; उनमें से 20 `common` चिह्नित हैं —
  वही set जिससे vk-bot अभिवादन करता है — और यही default selection हैं।
  vk-bot के `incomingGreetingStickersIds` सिर्फ आए हुए अभिवादन को
  _पहचानने_ के लिए इस्तेमाल होते हैं।
- **Telegram** — Bot API के `file_id` हर bot के लिए अलग होते हैं, इसलिए
  उन्हें पहले से इकट्ठा नहीं किया जा सकता। Catalogue sticker **set
  names** रखता है (`HotCherry`, `UtyaDuck`, …, हर एक अपने
  `https://t.me/addstickers/<name>` link के साथ), और adapter
  `getStickerSet` से live वे stickers list करता है जिनका emoji अभिवादन
  का इशारा है (👋 🖐 🖖 🙋 🤚 ✋ 🙌)। Previews उपयोगकर्ता के अपने server
  पर `GET /api/greetings/file?id=<thumbnail file_id>` से होकर आते हैं,
  जो `getFile` call करके image stream करता है, ताकि bot token कभी
  browser तक न पहुँचे।
- **Messenger** — thumbs-up `369239263222822` ही वह एक sticker है जिसे
  हर Page हमेशा भेज सकता है; कोई public catalogue API नहीं है।
- **WhatsApp** — sticker एक uploaded media id या public `.webp` link
  होता है; उपयोगकर्ता अपना खुद देता है।

Content Security Policy images को सिर्फ `'self'`, `data:`, `blob:` और
`https://vk.com` से allow करती है।

## 3. हर network क्या allow करता है

| Network  | Sticker किससे पहचाना जाता है | Live listing                | किसका अभिवादन हो सकता है                                 |
| -------- | ---------------------------- | --------------------------- | -------------------------------------------------------- |
| VK       | `sticker_id`                 | `store.getStickersKeywords` | कोई भी ज्ञात chat (messages block हों तो error 901/902)। |
| Telegram | `file_id` या `.webp`         | `getStickerSet`             | सिर्फ जवाब: bot बातचीत शुरू नहीं कर सकता।                |
| WhatsApp | media id या `.webp`          | —                           | Contact के आखिरी message के 24 h के अंदर।                |
| Facebook | `sticker_id`                 | —                           | Contact के आखिरी message के 24 h के अंदर।                |
| Zalo     | `attachment_id`              | —                           | 48 h के अंदर (catalogued; अभी कोई Zalo adapter नहीं है)। |
| X        | — (सिर्फ text)               | —                           | कोई भी ज्ञात chat।                                       |
| Email    | — (सिर्फ text)               | —                           | कोई भी ज्ञात address।                                    |

Planner इन नियमों को failed sends की जगह skip reasons में बदलता है:
`outside-messaging-window`, `network-unsupported` और
`no-greeting-available` (कोई sticker लागू नहीं होता और selection में उस
भाषा का कोई text नहीं है)। जिस network पर stickers नहीं हैं, या जो
उपयोगकर्ता text पसंद करता है, उसे चुने गए greeting texts में से एक भेजा
जाता है।

## 4. Planning

`planGreetings({links, mode, selection, limit = 10, staleDays = 30})`
हर chat के लिए stored messages का सारांश बनाता है, फिर:

- **`initiate`** — जिन chats में कभी लिखा नहीं गया वे पहले आते हैं, सबसे
  पुराने आखिरी message वाले पहले; उनके बाद वे chats जिनमें आखिरी message
  उपयोगकर्ता का था पर जो `staleDays` से ज़्यादा समय से चुप हैं। जिन chats
  का अभिवादन पहले ही हो चुका है (`greeting:<network>:<chat>` मौजूद है)
  उन्हें छोड़ दिया जाता है।
- **`reply`** — वे chats जिनका आखिरी message एक अनुत्तरित अभिवादन है:
  "Привет!", "hi", "你好", "नमस्ते", "xin chào", अकेला 👋, या कोई ज्ञात
  greeting sticker। Text अभिवादनों का जवाब उसी भाषा में दिया जाता है
  जिसमें वे लिखे गए थे; sticker या अकेले wave के लिए चुनी गई भाषा
  इस्तेमाल होती है।

हर chat एक envelope बनता है `{network, chat, contact, language, kind,
sticker, text, lastMessageAt, skipped?}`। `limit` सिर्फ उन envelopes को
गिनता है जो सच में भेजे जाएँगे। Planner `random` और `now` को arguments के
रूप में लेता है, इसलिए preview ठीक वही दिखाता है जो send करेगा।

## 5. भेजना

`runGreetings(plan, {store, delayMs})` envelopes को एक-एक करके हर network
के `live.post` से भेजता है और messages के बीच `delayMs` इंतज़ार करता है
(default 30 s, जैसे vk-bot में) ताकि batch spam की बौछार जैसा न लगे। हर
सफलता `greeting:<network>:<chat>` link के रूप में record होती है, इसलिए
एक ही chat का अभिवादन कभी दो बार नहीं होता। Failure (जैसे VK error 901)
उस chat के लिए report होता है और run जारी रहता है। Credentials उन्हीं
`secret:<network>:…` links से पढ़े जाते हैं जिन्हें sync पहले से इस्तेमाल
करता है।

## 6. Surfaces

```bash
meta-sovereign greetings-stickers                       # built-in catalogue
meta-sovereign greetings-stickers --live --networks=vk,telegram
meta-sovereign greetings-select --stickers=vk:72789,vk:21 --sets=UtyaDuck --language=ru
meta-sovereign greetings-plan --mode=initiate --limit=10
meta-sovereign greetings-send --mode=reply --delay-ms=30000
```

| Method | Path                       | उद्देश्य                                                   |
| ------ | -------------------------- | ---------------------------------------------------------- |
| GET    | `/api/greetings/catalogue` | Networks, built-in stickers, Telegram sets, texts।         |
| GET    | `/api/greetings/selection` | सहेजा गया selection (या default)।                          |
| PUT    | `/api/greetings/selection` | Selection सहेजें; अज्ञात networks हटा दिए जाते हैं।        |
| POST   | `/api/greetings/stickers`  | Stickers live list करें (`{networks}`)।                    |
| POST   | `/api/greetings/plan`      | Preview (`{mode, …}`) या send (`run: 'queue'`, `delayMs`)। |
| GET    | `/api/greetings/file?id=`  | Telegram thumbnail proxy।                                  |

HTTP पर `delayMs` की सीमा 60 000 है, ताकि कोई request घंटों तक लटकी न
रहे। Rust server में ये routes अभी नहीं हैं। इनके बिना SPA catalogue,
selection और preview के लिए local store पर fallback करता है, और बताता है
कि listing और sending के लिए JS server चाहिए।

**अभिवादन** screen networks table, sticker grid (built-in, live और पहले
चुने गए stickers, हर एक एक बार), Telegram sets उनके `t.me` links के साथ,
भाषा और sticker-या-text पसंद, और plan दिखाती है। **अभिवादन भेजें** तब तक
disabled रहता है जब तक preview में कम से कम एक ऐसा chat न हो जिसका सच
में अभिवादन होगा।

## 7. ज्ञात कमियाँ

- **Telegram के अपने empty-chat stickers।** Telegram apps खाली chat पर
  stickers सुझाने के लिए emoticon `👋⭐️` के साथ `messages.getStickers`
  call करते हैं (TDLib: `getGreetingStickers`)। यह MTProto _user_ API
  call है; Bot API उस तक नहीं पहुँच सकता, और bot वैसे भी chat शुरू नहीं
  कर सकता। Screen यह बताती है, और इसकी जगह live set listing देती है।
  इसे support करने के लिए user-account client (TDLib) चाहिए, जो एक अलग
  integration है।
- **Zalo** catalogued है, पर अभी कोई Zalo adapter नहीं है।
- **X** DMs में stickers नहीं होते, इसलिए X पर सिर्फ text से अभिवादन
  होता है।
