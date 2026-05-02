# Mobile Shell

The mobile shell uses Capacitor's web-native container model. The build
pipeline copies the same React bundle used by the local web server into
`mobile/www`, then Capacitor syncs that web directory into generated iOS
or Android native projects.

Commands:

- `npm run build:mobile` rebuilds `src/web/app.min.js` and writes
  `mobile/www`.
- `npm run mobile:sync` syncs `mobile/www` into already-generated
  native projects.
- `npm run mobile:ios` creates/syncs the iOS project if needed and opens
  it in Xcode.
- `npm run mobile:android` creates/syncs the Android project if needed
  and opens it in Android Studio.

The wrapper invokes `@capacitor/cli@^7.6.2`, the latest Capacitor major
that supports this package's Node 20 engine.

The WebView loads `discovery-shell.js` before the React bundle. Native
code or launch URLs can provide LAN server candidates through
`window.metaSovereignShell.discoveryCandidates`, `?server=...`, or the
`META_SOVEREIGN_DISCOVERY_CANDIDATES` global. The normal browser
discovery cascade then probes those candidates and falls back to local
offline storage when none answer.
