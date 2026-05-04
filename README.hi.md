# meta-sovereign (languages: [en](README.md) • [zh](README.zh.md) • hi • [ru](README.ru.md))

`meta-sovereign` एक व्यक्तिगत **meta profile sovereign** सिस्टम है: ऐसा unified inbox, CRM और automation platform जिसका स्वामित्व सचमुच उपयोगकर्ता के पास रहता है। यह local-first और privacy-respecting है, और VK, Telegram, X, WhatsApp, Facebook, LinkedIn, career.habr.com, hh.ru, superjob.ru तथा email providers से contacts, chats, email और patterns को एक जगह लाता है।

## अभी चलाकर देखें (install नहीं)

किसी भी आधुनिक browser में <https://link-foundation.github.io/meta-sovereign/> खोलें। Web app तुरंत boot होता है, पूरी तरह browser में चलता है, और default रूप से local storage में लिखता है। जब तक आप server नहीं जोड़ते, आपका data device से बाहर नहीं जाता।

> अगर link अभी live नहीं है, तो GitHub Pages workflow (`.github/workflows/pages.yml`) अगली `main` push पर इसे publish करेगा।

## local server चलाएँ (sync के लिए recommended)

Devices के बीच sync, at-rest encryption और पूरा feature set इस्तेमाल करने के लिए SPA के पास local server start करें। दो backend उपलब्ध हैं; दोनों समान wire protocol लागू करते हैं (देखें [`docs/SERVER-PARITY.hi.md`](docs/SERVER-PARITY.hi.md))।

### Rust server — preferred (single binary, runtime नहीं)

```bash
git clone https://github.com/link-foundation/meta-sovereign
cd meta-sovereign
cargo run --manifest-path rust/Cargo.toml -p meta-sovereign-server -- serve
```

### JavaScript server — fallback (Node/Bun/Deno)

```bash
npm install -g meta-sovereign
meta-sovereign serve
```

दोनों backend default रूप से <http://127.0.0.1:8787> पर listen करते हैं। Hosted SPA `discoverServer()` से local server खोजता है (saved override → `127.0.0.1` ports)। अगर browser auto-connect नहीं करता, app में **Settings → Server** खोलें और binary द्वारा print किया गया URL paste करें।

## SPA को server से जोड़ें

SPA server को इस क्रम में चुनता है ([`js/src/web/discover.js`](js/src/web/discover.js)):

1. **Same origin** — जब SPA सीधे JS या Rust server से serve हो।
2. **Saved override** — `localStorage.metaServer`, जिसे app का **Settings → Server** prompt set करता है।
3. **Runtime shell candidates** — Electron और Capacitor embedded server URL inject करते हैं।
4. **`127.0.0.1` ports** — default local-server port automatic probe होता है।
5. **Caller-supplied LAN candidates** — programmatically pass किए गए URLs।

यदि कोई server जवाब नहीं देता, SPA **offline mode** में रहता है: writes local browser store में जाती हैं ([`createBrowserStore`](js/src/storage/browser-store.js): IndexedDB → localStorage → memory) और अगली बार server मिलने पर [`OfflineClient`](js/src/web/client.js) उन्हें replay करता है।

पूरी user flow guide — बिना install, Rust server, JS server, desktop/mobile app, encrypted export और troubleshooting — [`docs/USER-GUIDE.hi.md`](docs/USER-GUIDE.hi.md) में है।

## यह क्या करता है

- **Unified inbox**: VK, Telegram, X, WhatsApp, Facebook, LinkedIn, career.habr.com, hh.ru, superjob.ru और email।
- **Personal CRM**: contacts, communities, group memberships, intersections और mass-personal outreach।
- **Personal memory**: conversations से structured `question → answer` facts।
- **Conversation automation platform**: pattern editors, reply-variation editors और n8n-style dialog graphs।
- **Portable data store**: binary [Doublets](https://github.com/linksplatform/doublets-rs) + text [Links Notation](https://github.com/link-foundation/links-notation), automated backups और `.lino` import/export।
- **Local-first runtime**: user-owned devices के बीच WebRTC sync और optional self-hosted personal cloud।
- **Two stacks**: JS + Rust/WebAssembly default stack और pure Rust server/microservice variant; on-disk format साझा है।

पूर्ण requirement → status mapping [`docs/REQUIREMENTS.hi.md`](docs/REQUIREMENTS.hi.md) में है; per-issue case studies [`docs/case-studies/`](docs/case-studies/) में हैं।

## स्थिति

issue #1 का prototype implement हो चुका है और PR #2 में track है:

- **Data layer (R-A\*)**: `DualStore` Doublets binary और Links Notation text को lock-step में रखता है; AES-256-GCM backups और `secret:*` link encryption उपलब्ध हैं।
- **Service connectors (R-E\*)**: VK, Telegram, X, WhatsApp, Facebook, LinkedIn, career.habr.com, hh.ru, superjob.ru और email के archive parsers तथा live connectors।
- **Pattern matching और automation (R-C\*)**: `inferRegex`, `simplifyRegex`, `compilePeg`, fuzzy reply variation extraction और `createGraph` / `runGraph`।
- **CRM (R-D\*)**: contact aggregation, audience DSL, mass-personal outreach, profile और resume sync envelopes।
- **Distribution (R-F\*)**: NPM library, CLI, local server, Electron shell, Capacitor mobile shell और Docker web + WebRTC microservices।
- **Stacks (R-G\*)**: JS server + React SPA + Rust/WASM heavy workloads, साथ में pure Rust server।
- **Hardening (R-K\*)**: soft delete by default, AES-256-GCM master-key vault, multiple unlock methods और encrypted export।
- **Browser publishing (R-L\*)**: GitHub Pages CI workflow, public SPA URL और user-first README/user guide।

## Repository structure

`meta-sovereign` multi-language repository है:

- **JavaScript** `js/` में रहता है: `js/src/`, `js/tests/`, `js/scripts/`, `js/bin/`, `js/electron/`, `js/examples/`, `js/experiments/`।
- **Rust** `rust/` में रहता है: workspace manifest, lockfile और crates।
- **Native shells**: `js/electron/`, `mobile/`, `capacitor.config.json`, `docker/`।
- **Operations**: `.github/workflows/`, `.changeset/`, `docs/`।

```
.
├── .changeset/           # Changeset configuration
├── .github/workflows/    # GitHub Actions CI/CD
├── docker/               # Web + WebRTC Dockerfiles
├── docs/                 # Requirements, user guide, server parity, case studies
├── js/                   # JavaScript tree
├── mobile/               # Capacitor mobile shell
├── rust/                 # Rust workspace
└── package.json          # Node.js package manifest
```

---

## Developer reference

यह भाग contributors के लिए है।

### Quick start

```bash
bun install
bun test
npm test
deno test --allow-read --allow-write --allow-env --allow-net --allow-sys js/tests

RUN_BROWSER_E2E=1 npm run test:e2e:browser
cargo test --manifest-path rust/Cargo.toml --workspace
npm run build:web
npm run build:pages
bun run lint
bun run format:check
```

### CI/CD और quality gates

Pipeline fast checks, slow matrix tests, API docs build, broken-link checks और automated release चलाता है। हर job में explicit `timeout-minutes` है, और individual tests में `node --test --test-timeout=30000` / `bun test --timeout 30000` guard है।

हर PR को ये checks पास करने चाहिए:

- ESLint और Prettier;
- `jscpd` duplication check;
- secrets scan;
- file line limits;
- Node, Bun, Deno × Ubuntu, macOS, Windows test matrix;
- docs बदलने पर documentation validation।

विस्तार के लिए [`docs/BEST-PRACTICES.hi.md`](docs/BEST-PRACTICES.hi.md) देखें।

### Scripts reference

| Script                 | Description                       |
| ---------------------- | --------------------------------- |
| `bun test`             | Bun से tests चलाएँ                |
| `bun run lint`         | ESLint से code जाँचें             |
| `bun run lint:fix`     | lint issues auto-fix करें         |
| `bun run format`       | Prettier से formatting करें       |
| `bun run format:check` | formatting check करें             |
| `bun run check`        | lint + format + duplication चलाएँ |
| `bun run changeset`    | नया changeset बनाएँ               |
| `bun run build:web`    | production SPA bundle बनाएँ       |
| `bun run build:pages`  | `dist/pages/` artifact बनाएँ      |
| `bun run build:mobile` | Capacitor mobile bundle बनाएँ     |

### Contributing

विस्तृत guidelines [`docs/CONTRIBUTING.hi.md`](docs/CONTRIBUTING.hi.md) में हैं। सामान्य flow: fork करें, branch बनाएँ, बदलाव करें, changeset बनाएँ, commit करें, push करें और Pull Request खोलें।

## License

[Unlicense](LICENSE) - public domain.
