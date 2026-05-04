# 移动外壳 (languages: [en](README.md) • zh • [hi](README.hi.md) • [ru](README.ru.md))

移动外壳使用 Capacitor 的 web-native 容器模型。构建流程会把本地 Web
服务器使用的同一个 React bundle 复制到 `mobile/www`，然后 Capacitor
将这个 Web 目录同步到生成的 iOS 或 Android 原生项目中。

命令：

- `npm run build:mobile` 重新构建 `js/src/web/app.min.js` 并写入
  `mobile/www`。
- `npm run mobile:sync` 将 `mobile/www` 同步到已经生成的原生项目。
- `npm run mobile:ios` 在需要时创建/同步 iOS 项目，并用 Xcode 打开。
- `npm run mobile:android` 在需要时创建/同步 Android 项目，并用 Android
  Studio 打开。

包装层调用 `@capacitor/cli@^7.6.2`，这是支持本包 Node 20 engine 的最新
Capacitor major。

WebView 会先加载 `discovery-shell.js`，再加载 React bundle。原生代码或启
动 URL 可以通过 `window.metaSovereignShell.discoveryCandidates`、
`?server=...` 或 `META_SOVEREIGN_DISCOVERY_CANDIDATES` 全局变量提供 LAN
服务器候选。普通浏览器的发现级联随后会探测这些候选，并在没有服务器响应
时回退到本地离线存储。
