# HTTP परिवहन (भाषाएँ: [en](HTTP-TRANSPORT.md) • [zh](HTTP-TRANSPORT.zh.md) • hi • [ru](HTTP-TRANSPORT.ru.md))

JavaScript सर्वर संरचित HTTP संदेशों के लिए `lino-rest-api` इस्तेमाल करता है। डिफ़ॉल्ट उत्तर `text/lino` है। बाइनरी Links Notation के लिए `Accept: application/lino-binary` भेजें। लिखने पर वही प्रकार `Content-Type` में दें; `text/lino-line` और `text/lino-compact` भी समर्थित हैं। बाइनरी प्रारूप typed object AST को encode करता है और strings, numbers, Unicode तथा खाली containers सुरक्षित रखता है।

असमर्थित अनुरोध प्रारूप पर 415 मिलता है। अस्वीकार्य उत्तर प्रारूप पर बदलाव चलने से पहले 406 मिलता है। `Accept` के अधिक विशिष्ट निषेध wildcard से पहले लागू होते हैं। Origin, Host, passcode, गोपनीय जानकारी छिपाने और आकार की जाँच बनी रहती है। सामान्य अनुरोध सीमा 1 MiB है; archive routes की मौजूदा बड़ी सीमाएँ सुरक्षित हैं। Decoder इनपुट आकार, nesting और binary graph विस्तार भी सीमित करते हैं।

JSON compatibility डिफ़ॉल्ट बंद है। पुराने client के लिए इसे सर्वर पर स्पष्ट रूप से चालू करें:

```bash
node js/bin/meta-sovereign.js serve --json-compatibility=true
```

Library विकल्प `startServer({ jsonCompatibility: true })` और environment विकल्प `MS_JSON_COMPATIBILITY=1` है। इस mode में client `application/json` माँग सकता है; स्पष्ट Lino अनुरोध भी चलते हैं। नया browser client Lino इस्तेमाल करता है और डिफ़ॉल्ट रूप से अनपेक्षित JSON उत्तर अस्वीकार करता है। Provider APIs, downloaded files तथा raw media/archive uploads अपने प्रारूप रखते हैं।

Live change तथा Telegram account notification streams में `text/event-stream` के हर data field में एक `text/lino-line` record होता है। Browser compatibility-enabled server पर भी `?format=lino-line` माँगता है। Codec संदेश के newline escape करता है। JSON events के लिए server compatibility mode आवश्यक है; इसके बिना `?format=json` पर 406 मिलता है। Reconnection, Origin जाँच, secret filtering और slow-client handling बनी रहती है।

JavaScript WebSocket sync और WebRTC signaling `meta-sovereign-sync.lino.v2` (text) या `meta-sovereign-sync.lino-binary.v2` (binary) पर सहमत होते हैं। WebRTC data channels भी यही protocol घोषित करते हैं। Client गायब या बेमेल चयन अस्वीकार करता है। पुराने `meta-sovereign-sync.v1` JSON के लिए दोनों तरफ compatibility mode स्पष्ट रूप से चालू होना चाहिए। बिना protocol वाला connection डिफ़ॉल्ट रूप से text Lino इस्तेमाल करता है; server compatibility स्पष्ट रूप से चालू हो तो पुराना JSON मिलता है। संदेश और connection से पहले की queue 4 MiB तक सीमित हैं; बहुत बड़े या अमान्य incoming frames connection बंद करते हैं। Origin जाँच, room isolation और secret filtering लागू रहते हैं। [Sync जाँच](case-studies/issue-56/lino-sync.md) देखें।

JavaScript TCP sync में यही versioned protocols हैं। दोनों तरफ configured protocol और newline भेजे जाते हैं, फिर चार-byte unsigned big-endian byte length और चुने हुए Lino body वाले records आते हैं। डिफ़ॉल्ट text है; binary के लिए दोनों तरफ `--sync-format=binary` दें (library: `format: 'application/lino-binary'`)। अपने-आप fallback नहीं होता। Record और queue की सीमा 4 MiB, preface की 128 bytes और handshake की 10 seconds है। पुराने newline JSON के लिए दोनों तरफ `--sync-format=json --json-compatibility=true` आवश्यक है। Listener केवल loopback पर रहता है। CLI sync commands interrupt तक चलते हैं, फिर connections बंद करके store flush और release करते हैं।

Native Rust server के मौजूदा endpoints अब वही चार HTTP representations और versioned text/binary WebSocket sync/signaling उपयोग करते हैं। यह official Rust `links-notation` parser/binary codec उपयोग करता है; JavaScript HTTP boundary Lino REST ही है। JSON के लिए `ServerOptions { json_compatibility: true, ..Default::default() }`, `meta-sovereign-rs serve --json-compatibility` या `MS_JSON_COMPATIBILITY=1` आवश्यक है। HTTP body सीमा 16 MiB, decoder सीमा 64 MiB और socket/message queues की सीमा 4 MiB है। Fragmented Unicode, control frames तथा हर peer के format में reencoding समर्थित हैं; invalid frames connection बंद करते हैं। `MS_SYNC_DEBUG=1` payload के बिना rejection codes दिखाता है। Listener loopback तक सीमित है। R-AA16 verification और पूर्ण native feature parity अभी खुले हैं; [native investigation](case-studies/issue-56/lino-native.md) और [requirements](REQUIREMENTS.hi.md) देखें।
