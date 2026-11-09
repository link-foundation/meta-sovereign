# HTTP परिवहन (भाषाएँ: [en](HTTP-TRANSPORT.md) • [zh](HTTP-TRANSPORT.zh.md) • hi • [ru](HTTP-TRANSPORT.ru.md))

JavaScript सर्वर संरचित HTTP संदेशों के लिए `lino-rest-api` इस्तेमाल करता है। डिफ़ॉल्ट उत्तर `text/lino` है। बाइनरी Links Notation के लिए `Accept: application/lino-binary` भेजें। लिखने पर वही प्रकार `Content-Type` में दें; `text/lino-line` और `text/lino-compact` भी समर्थित हैं। बाइनरी प्रारूप typed object AST को encode करता है और strings, numbers, Unicode तथा खाली containers सुरक्षित रखता है।

असमर्थित अनुरोध प्रारूप पर 415 मिलता है। अस्वीकार्य उत्तर प्रारूप पर बदलाव चलने से पहले 406 मिलता है। `Accept` के अधिक विशिष्ट निषेध wildcard से पहले लागू होते हैं। Origin, Host, passcode, गोपनीय जानकारी छिपाने और आकार की जाँच बनी रहती है। सामान्य अनुरोध सीमा 1 MiB है; archive routes की मौजूदा बड़ी सीमाएँ सुरक्षित हैं। Decoder इनपुट आकार, nesting और binary graph विस्तार भी सीमित करते हैं।

JSON compatibility डिफ़ॉल्ट बंद है। पुराने client के लिए इसे सर्वर पर स्पष्ट रूप से चालू करें:

```bash
node js/bin/meta-sovereign.js serve --json-compatibility=true
```

Library विकल्प `startServer({ jsonCompatibility: true })` और environment विकल्प `MS_JSON_COMPATIBILITY=1` है। इस mode में client `application/json` माँग सकता है; स्पष्ट Lino अनुरोध भी चलते हैं। नया browser client Lino इस्तेमाल करता है और डिफ़ॉल्ट रूप से अनपेक्षित JSON उत्तर अस्वीकार करता है। Provider APIs, downloaded files तथा raw media/archive uploads अपने प्रारूप रखते हैं।

Live change तथा Telegram account notification streams में `text/event-stream` के हर data field में एक `text/lino-line` record होता है। Browser compatibility-enabled server पर भी `?format=lino-line` माँगता है। Codec संदेश के newline escape करता है। JSON events के लिए server compatibility mode आवश्यक है; इसके बिना `?format=json` पर 406 मिलता है। Reconnection, Origin जाँच, secret filtering और slow-client handling बनी रहती है।

R-AA16 अभी अधूरा है: socket sync/signaling और Rust backend का protocol migration तथा verification बाकी है। केवल HTTP बदलाव native server parity सिद्ध नहीं करता। [आवश्यकता सूची](REQUIREMENTS.hi.md) और [परिवहन जाँच](case-studies/issue-56/lino-http.md) देखें।
