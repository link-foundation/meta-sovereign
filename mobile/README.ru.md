# Мобильная оболочка (languages: [en](README.md) • [zh](README.zh.md) • [hi](README.hi.md) • ru)

Мобильная оболочка использует web-native модель Capacitor. Build
pipeline копирует тот же React bundle, который использует локальный web
server, в `mobile/www`, а затем Capacitor синхронизирует эту web
directory в сгенерированные iOS или Android native projects.

Команды:

- `npm run build:mobile` пересобирает `js/src/web/app.min.js` и пишет
  `mobile/www`.
- `npm run mobile:sync` синхронизирует `mobile/www` в уже
  сгенерированные native projects.
- `npm run mobile:ios` при необходимости создает/синхронизирует iOS
  project и открывает его в Xcode.
- `npm run mobile:android` при необходимости создает/синхронизирует
  Android project и открывает его в Android Studio.

Wrapper вызывает `@capacitor/cli@^7.6.2`, последний major Capacitor,
который поддерживает Node 20 engine этого package.

WebView загружает `discovery-shell.js` перед React bundle. Native code
или launch URLs могут передать LAN server candidates через
`window.metaSovereignShell.discoveryCandidates`, `?server=...` или
global `META_SOVEREIGN_DISCOVERY_CANDIDATES`. Обычный browser discovery
cascade затем проверяет эти candidates и возвращается к local offline
storage, если ни один сервер не отвечает.
