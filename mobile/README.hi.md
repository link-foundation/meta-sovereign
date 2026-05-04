# मोबाइल शेल (languages: [en](README.md) • [zh](README.zh.md) • hi • [ru](README.ru.md))

मोबाइल शेल Capacitor के web-native container model का उपयोग करता है।
Build pipeline वही React bundle, जिसे local web server उपयोग करता है,
`mobile/www` में copy करती है। इसके बाद Capacitor उस web directory को
generated iOS या Android native projects में sync करता है।

Commands:

- `npm run build:mobile` `js/src/web/app.min.js` को rebuild करता है और
  `mobile/www` लिखता है।
- `npm run mobile:sync` `mobile/www` को पहले से बने native projects में
  sync करता है।
- `npm run mobile:ios` जरूरत पड़ने पर iOS project बनाता/sync करता है और
  उसे Xcode में खोलता है।
- `npm run mobile:android` जरूरत पड़ने पर Android project बनाता/sync
  करता है और उसे Android Studio में खोलता है।

Wrapper `@capacitor/cli@^7.6.2` चलाता है, जो इस package के Node 20
engine को support करने वाला latest Capacitor major है।

WebView React bundle से पहले `discovery-shell.js` load करता है। Native
code या launch URL LAN server candidates को
`window.metaSovereignShell.discoveryCandidates`, `?server=...` या
`META_SOVEREIGN_DISCOVERY_CANDIDATES` global से दे सकते हैं। Normal
browser discovery cascade उन candidates को probe करता है और कोई server
उत्तर न दे तो local offline storage पर fallback करता है।
