---
'meta-sovereign': patch
---

Use GitHub Pages as the default web app and keep the local server as its backend. The localhost UI is disabled unless `--local-ui=true` or `MS_LOCAL_UI=on` is set; desktop shells explicitly enable their bundled UI. Update all four languages' guides and connection notices. Cached Telegram chats stop requesting history when no user account is connected and show how to connect instead of an endless spinner.

Interactive macOS startup now detects certificate trust, requests it only when needed, protects the per-installation TLS key at rest with a device-only Secure Enclave wrapping key, and opens the hosted app. Both JS and Rust restrict default browser access to the official GitHub Pages origin and the exact local origin, including socket upgrades; unrelated discovery responses are rejected.
