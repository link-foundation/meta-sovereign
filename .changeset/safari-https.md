---
'meta-sovereign': minor
---

R-Y64: the server now serves HTTPS on the same port as HTTP, using its own self-signed certificate valid for localhost, 127.0.0.1 and ::1 only (kept in `<store>/tls/`, renewed automatically 30 days before expiry). Run `npx -y meta-sovereign trust` once on macOS to add the certificate to the login keychain (other systems print the certificate path), or open `https://127.0.0.1:<port>/trust` in Safari, click Show Details → visit this website, and enter your password. After trusting, the hosted app at <https://link-foundation.github.io/meta-sovereign/> connects to the local server in Safari directly, without needing the server's own copy. Before trusting, the in-app notice links both **Open the app from the server** and a **Trust the server** page. `--tls=false` / `MS_TLS=off` turns HTTPS off.
