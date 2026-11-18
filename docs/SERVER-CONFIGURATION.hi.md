# सर्वर और स्वचालन विन्यास (भाषाएँ: [en](SERVER-CONFIGURATION.md) • [ru](SERVER-CONFIGURATION.ru.md) • hi • [zh](SERVER-CONFIGURATION.zh.md))

`meta-sovereign serve` और डेस्कटॉप ऐप पठनीय Links Notation इस क्रम में पढ़ते हैं:

1. उपयोगकर्ता का `config.lino`, `store` फ़ोल्डर के पास। Linux:
   `$XDG_CONFIG_HOME/Meta Sovereign/config.lino`, अन्यथा
   `~/.config/Meta Sovereign/config.lino`; macOS:
   `~/Library/Application Support/Meta Sovereign/config.lino`; Windows:
   `%APPDATA%/Meta Sovereign/config.lino`।
2. वर्तमान फ़ोल्डर में `.meta-sovereign/config.lino` या `--app-config=<file>`।
3. स्पष्ट कमांड विकल्प सर्वर के फ़ाइल मानों को बदलते हैं।

सामान्य फ़ाइलों का गायब होना स्वीकार्य है; स्पष्ट चुनी गई फ़ाइल मौजूद होनी
चाहिए। सापेक्ष पथ वर्तमान फ़ोल्डर से है। `--store` और
`META_SOVEREIGN_STORE_DIR` उपयोगकर्ता विन्यास का स्थान बदले बिना डेटा स्थान
बदलते हैं। सर्वर के पर्यावरण मान विकल्प के रूप में रहते हैं;
`MS_TLS=off` TLS बंद करता है।

```lino
configuration:
  server configuration_server

configuration_server:
  port 8788
  localUi true
  verbose false
  jsonCompatibility false
```

`meta-sovereign serve --port=8787` केवल पोर्ट बदलता है। नेस्टेड ऑब्जेक्ट नामित
संदर्भों का उपयोग करते हैं; JSON या टाइप मार्कर आवश्यक नहीं हैं।

| `server` फ़ील्ड                                  | मान                                                    | विकल्प                                                     |
| ------------------------------------------------ | ------------------------------------------------------ | ---------------------------------------------------------- |
| `port`                                           | 0–65535; 0 उपलब्ध पोर्ट चुनता है                       | `--port`                                                   |
| `verbose`, `localUi`, `tls`, `jsonCompatibility` | `true` / `false`                                       | `--verbose`, `--local-ui`, `--tls`, `--json-compatibility` |
| `backupIntervalHours`, `backupKeep`              | 0–596 घंटे; 0 बंद; 0–10000 संग्रह; 0 सब रखता है        | `--backup-interval-hours`, `--backup-keep`                 |
| `recoveryFormats`                                | `text`, `binary`, `text,binary`, `binary,text`, `none` | `--recovery-formats`                                       |
| `allowOrigin`, `uiUrl`                           | `none` या अल्पविराम/स्पेस से स्रोत; ऐप का HTTP(S) पता  | `--allow-origin`, `--ui-url`                               |
| `theme`                                          | `system`, `light`, `dark`, `auto`                      | `--theme`                                                  |
| `skin`                                           | `t3`, `telegram`, `whatsapp`, `signal`                 | `--skin`                                                   |
| `language`                                       | `system`, `en`, `ru`, `zh`, `hi`                       | `--language`                                               |

फ़ाइल सीमा 64 KiB है। नामित पाइप और अन्य गैर-सामान्य फ़ाइलें बिना प्रतीक्षा
अस्वीकृत होती हैं। अज्ञात फ़ील्ड, अमान्य मान, अपठनीय फ़ाइल या URL में पहचान
जानकारी पर सामान्य त्रुटि देकर शुरुआत रुकती है। रहस्य ऐप के सुरक्षित
क्रेडेंशियल नियंत्रणों में रखें।

डेस्कटॉप वही विकल्प स्वीकार करता है। डिफ़ॉल्ट में बंडल UI चालू, उपलब्ध पोर्ट
और TLS बंद है। `localUi false` में पोर्ट 8787 होस्ट किए ऐप को सर्वर खोजने देता
है; विशेष पोर्ट सेटिंग्स में चुनें। स्पष्ट TLS पर विंडो HTTPS उपयोग करती है।
प्रमाणपत्र छूट स्वामित्व वाली स्थानीय विंडो, सटीक स्रोत और प्रमाणपत्र
फ़िंगरप्रिंट तक है; क्लिपबोर्ड अनुमति भी उसी स्रोत तक है। सहेजी गई ब्राउज़र
भाषा/दिखावट फ़ाइल से ऊपर रहती है; रीसेट वर्तमान डिफ़ॉल्ट फिर लागू होने देता है।

## छह VK स्वचालन

`automations.vk` में `online`, `friends`, `cleanup`, `outgoing`, `wall` और
`birthday` स्वीकार हैं। [पूरा उदाहरण](../examples/desktop-automation-config.lino)
`.meta-sovereign/config.lino` में कॉपी करें। इसकी छह नीतियाँ रुकी हैं; चालू करने
से पहले नमूना ID और टेक्स्ट बदलें।

सबमें `enabled` और `everyMinutes` हैं: `online` के लिए 1–14 मिनट, बाकी के लिए
1–1440। अतिरिक्त फ़ील्ड:

| नीति                  | फ़ील्ड                                                                                                                                                                                                         |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `friends`             | `maxFriends`, `batchSize`, `priorityIds`, `topPercentMutuals` (0–100), `acceptancePolicy` (`ranked-batch` / `desktop-ten-percent` / `desktop-configured`)                                                      |
| `cleanup`, `outgoing` | `limit`, `priorityIds`                                                                                                                                                                                         |
| `wall`                | `limit`, `cooldownDays`, `communities`, `messages`, `marker`, `attachments`, `restrictedCommunities`, `restrictedMessage`, `replaceOwned`, `activeAvatar`, `randomAttachment`, `holdAnyVisible`, `priorityIds` |
| `birthday`            | `limit`, `scanLimit`, `timeZone`, `messages`, `stickers`, `attachments`, `onlineOnly`, `priorityIds`                                                                                                           |

मौजूदा स्वचालन नियंत्रणों की वही जाँच और सीमाएँ लागू हैं। `wall` चालू करने से
पहले गंतव्य और हर निमंत्रण में मार्कर चाहिए। देखें:
[मित्र](VK-FRIEND-REQUESTS.md), [रखरखाव](VK-FRIEND-MAINTENANCE.md),
[निमंत्रण](VK-COMMUNITY-INVITATIONS.hi.md), [जन्मदिन](VK-BIRTHDAY-GREETINGS.hi.md)।
पुराने खाली/एकल/सूची मान मौजूदा संगत रीडर से सामान्य होते हैं; गलत भरी
संरचनाएँ अस्वीकृत होती हैं। बाद की सूची पहले की सूची को बदलती है।

नीति प्राथमिकता: मूल रुके डिफ़ॉल्ट → वैश्विक फ़ाइल → स्थानीय/चुनी फ़ाइल →
`--automation-defaults=<readable-Lino>` → मालिक की सहेजी सेटिंग्स → नीति सहेजने
के स्पष्ट कमांड विकल्प। नीति के फ़ील्ड मिलते हैं। इनलाइन दस्तावेज़ में सीधे
`vk` होता है, बाहरी `automations` नहीं।

`meta-sovereign vk-online --app-config=.meta-sovereign/config.lino` प्रभावी
सेटिंग्स पढ़ता है; `--every-minutes=7` बाद के फ़ाइल बदलावों से ऊपर रहने वाला
मालिक का चुनाव सहेजता है। पढ़ना नीति नहीं लिखता और प्रदाता कार्य नहीं चलाता।
हर परत बाद के बदलाव से पहले वैध होनी चाहिए। इनलाइन Lino सीमा भी 64 KiB है।
टोकन, पासवर्ड और cookies निषिद्ध हैं; `vk-token import` के छिपे इनपुट जैसे
सुरक्षित क्रेडेंशियल नियंत्रण उपयोग करें।

फ़ाइल दोबारा पढ़ने के लिए डेस्कटॉप पुनः शुरू करें या `serve` दोहराएँ। प्रभावी
डिफ़ॉल्ट बदलने पर ही rolling सर्वर नया worker तैयार करता है और हटे फ़ाइल
डिफ़ॉल्ट साफ़ करता है। मालिक का सहेजा चुनाव, रुकी नीति सहित, प्राथमिक रहता
है। स्पष्ट `enabled true` सर्वर scheduler शुरू होने पर पहले अनिर्धारित नीति
चालू कर सकता है; मौजूदा क्रेडेंशियल और डिलीवरी जाँच लागू रहती हैं। CLI स्थिति
पढ़ना scheduler शुरू नहीं करता।
