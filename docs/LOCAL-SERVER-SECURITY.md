# Local server setup and security

The default app is <https://link-foundation.github.io/meta-sovereign/>. The server is its local backend. It binds to `127.0.0.1`, does not expose a LAN listener, and redirects `/` to GitHub Pages. Its web UI is disabled unless `--local-ui=true` or `MS_LOCAL_UI=on` is explicitly set. Desktop shells enable their bundled UI themselves.

From a source checkout, one command sets up and starts the server:

```bash
node js/bin/meta-sovereign.js serve
```

In an interactive terminal on macOS, `serve` creates or reuses the installation's certificate, protects its private key with Secure Enclave, checks whether macOS already trusts that exact certificate for `localhost` and `127.0.0.1`, and requests trust only if necessary. macOS may ask for your password. It then opens the GitHub Pages app. Headless runs can explicitly request the same setup and browser launch:

```bash
node js/bin/meta-sovereign.js serve --trust=true --open=true
```

Use `--trust=false` to leave system trust unchanged and `--open=false` to keep the browser closed. The standalone `trust` command remains available. Certificate trust is an OS decision; a website cannot grant it silently. When trust is declined, the server prints how to complete setup later.

## Certificate identity and hardware protection

Each installation generates a random P-256 key and a unique self-signed leaf certificate. The certificate covers only `localhost`, `127.0.0.1` and `::1`; it is not a certificate authority. Startup prints its SHA-256 fingerprint. Before reusing an existing identity, the server checks its validity, loopback names, self-signature and matching private key. Expiring certificates are renewed and need trust again.

On supported Macs, a small bundled Swift source helper uses CryptoKit to create a device-only, non-exportable Secure Enclave wrapping key. It encrypts the TLS private key with authenticated encryption bound to the certificate fingerprint. Only the encrypted envelope is stored in `<store>/tls/localhost.key`, with owner-only permissions. Copying the store to another computer does not make that certificate usable there. When macOS reports that the protected key is temporarily inaccessible (OSStatus −25308), `serve` explains that the Mac must be unlocked and retries every five seconds. This preserves the existing trusted identity. Other failures to unlock a protected key stop TLS startup; the key is never silently replaced or downgraded to HTTP. The device-only key is available only while the Mac is unlocked, as described in [Apple’s accessibility documentation](https://developer.apple.com/documentation/security/ksecattraccessiblewhenunlockedthisdeviceonly). See [Apple's Secure Enclave key documentation](https://developer.apple.com/documentation/security/protecting-keys-with-the-secure-enclave).

This protects the key **at rest**. Node decrypts its TLS key into process memory for the TLS handshake; TLS signing itself does not run inside Secure Enclave. An attacker already running code as your user on the original unlocked Mac can potentially use the key. This is not hardware attestation, client authentication, or protection from a compromised local account.

The Swift helper is compiled locally using the macOS Command Line Tools. On a Mac without that toolchain or Secure Enclave support, setup reports the problem rather than claiming hardware protection. `--hardware-key=false` explicitly opts into an owner-only file key for a new, unprotected installation. It does not remove protection from an existing sealed key. Windows and Linux currently use unique owner-only file keys; TPM/CNG protection is not implemented.

## Browser and transport access

On Node, trusted local HTTPS negotiates HTTP/2 so API calls remain independent of media downloads and open event streams. HTTP/1 clients and WebSocket upgrades remain supported on the same port. Authority/Host validation and Origin restrictions apply to both versions. See the [Node HTTP/2 compatibility API](https://nodejs.org/api/http2.html#compatibility-api).

The JavaScript and Rust HTTP servers allow browser requests only from their own exact loopback origin or `https://link-foundation.github.io` by default. The scheme, host and port must match for same-origin requests. Other origins, including `null`, unrelated GitHub Pages sites, other localhost ports and Capacitor WebViews, are refused unless explicitly configured. Origin checks also apply before `/ws` sync and `/rtc` signaling upgrades. The Rust server does not implement TLS or hardware key protection; use the JavaScript server for Safari's trusted HTTPS connection.

Preflight responses echo the exact allowed origin, list supported methods and headers, and grant private-network access only for an allowed preflight. There are no wildcard CORS responses. Requests from denied origins are refused on reads as well as writes. Browser cross-site requests without an Origin header are refused except for the JavaScript server's public discovery beacon. The beacon contains only discovery capability information.

The hosted app probes HTTPS before HTTP and requires the `meta-sovereign` service identifier in the lightweight `/api/status?probe=1` response (or a legacy full status response). The probe inherits the same origin and passcode checks but does not scan or verify the archive. Each probe has a timeout, so an unrelated or stalled service cannot trap discovery. Safari connects over local HTTPS after trust; When TLS is enabled, direct localhost UI and API requests over HTTP redirect to HTTPS; direct plaintext socket upgrades are refused. HTTP remains available to the explicitly allowed GitHub Pages origin for browser compatibility, and `--tls=false` is an explicit opt-out. The browser may separately ask for local-network permission. No LAN scanning or remote listener is enabled by default.

`--allow-origin`, `MS_ALLOW_ORIGINS`, `--ui-url`, `MS_UI_URL` and `MS_ALLOW_HOSTS` are explicit overrides; only set them for sources you intend to trust. Mobile WebViews must explicitly configure their origin. CORS is a browser boundary, not authentication for local programs: local CLI requests without Origin remain supported. GitHub Pages origins do not include repository paths, so the browser cannot distinguish separate repositories hosted under the same `link-foundation.github.io` origin.

To revoke this installation's certificate trust:

```bash
node js/bin/meta-sovereign.js trust --remove=true
```

Revoking trust leaves the local data and protected key in place. Keep `<store>/tls/` private and out of version control. Restore a backup onto another computer as data, then create and trust that computer's own TLS identity rather than copying a sealed device key.

The default store is the OS user’s application folder. Startup migrates an older checkout store without changing its certificate or protected key. See [persistent data and migration](CHAT-READINESS.md#durable-application-folder).
