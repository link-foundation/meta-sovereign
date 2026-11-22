# Hosted workspaces

Run `serve-cloud` when users should open meta-sovereign at an HTTPS address from any browser. The cloud host serves the same Chat, Operator, Contacts, Connections and other web views. Each workspace is a personal instance with one owner, one origin, one server process, and its own persistent storage. Connect provider accounts in the workspace. The synchronization and automation jobs run on the host and continue when the browser closes.

## Deploy on a Linux host

Install Docker Engine 28 or later, Docker Compose, Node.js, and an HTTPS reverse proxy such as Caddy. Point each workspace DNS name at the proxy. The example below keeps port 8787 inside the containers and uses a distinct loopback port for each workspace.

```sh
mkdir -m 700 "$HOME/ms-workspaces"
node docker/init-workspace.mjs "$HOME/ms-workspaces/acme" acme.example.com 18787
docker compose -f docker/cloud-compose.yml \
  --env-file "$HOME/ms-workspaces/acme/workspace.env" up -d --build
```

Install the generated `workspace.caddy` as a site block in your host Caddy configuration and reload it. Caddy obtains the certificate and redirects HTTP to HTTPS. With any proxy, enable HTTP/2 on the public HTTPS listener so live event streams and ordinary requests can share a connection. Preserve the browser's `Host` and `Origin` headers, support WebSocket upgrades and unbuffered server-sent events, and disable edge caching on the workspace. Expose only the proxy to the public Internet. [Caddy reverse proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy) · [Caddy automatic HTTPS](https://caddyserver.com/docs/automatic-https).

Check `https://acme.example.com/_cloud/health` for process readiness. It returns only `{"ok":true}` after the server starts. For disk, store and provider health, sign in and open **Status**. Give the owner the workspace URL and the contents of `secrets/owner.key` over a secure channel. The user enters that key on the workspace sign-in page. Store `secrets/store.key` in the operator's secret manager for recovery. Keep keys and the workspace configuration directory out of source control.

Repeat the same procedure with a new configuration directory, DNS name and private port for each owner. The generated Compose project name is based on the directory name. Use a unique directory name within the Docker host. Each project creates its own bridge network and data volume. The network policy restricts outgoing workspace connections to public IPv4 plus Docker's DNS resolver. The web process runs as an unprivileged user in a read-only root filesystem. Use encrypted volumes and put disk and compute quotas appropriate for each workspace on the host. Keep sensitive host and platform services off the workspace's reachable networks, including services with publicly routable IPs.

## Branding

Edit `workspace.env` and run the same Compose `up -d` command for the workspace.

| Setting                    | Value                                                                                                                                                                           |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MS_CLOUD_BRAND_NAME`      | Plain display name up to 64 characters. Used on sign-in, the browser title and the app header.                                                                                  |
| `MS_CLOUD_BRAND_ACCENT`    | A six-digit hex color, for example `'#067085'`. The default app theme derives accessible light and dark accents from it.                                                        |
| `MS_CLOUD_BRAND_LOGO_FILE` | Optional PNG up to 256 KiB. Put `logo.png` in the workspace's `secrets` directory and set this to `/workspace/logo.png`. Used on sign-in, in the app header and as its favicon. |

For a change to a mounted file, use `up -d --force-recreate web` so the app rereads it. A release can update all configured workspaces using the same checkout. Rebuild and recreate each workspace from the new revision while preserving its volume and its keys.

## Run on another host or platform

Use a Node.js runtime supported by this checkout, install the repository dependencies and build the SPA as documented in the README. Set these three environment variables and provide a private persistent directory for the workspace.

```sh
export MS_CLOUD_ORIGIN=https://acme.example.com
export MS_CLOUD_OWNER_KEY_FILE=/run/workspace-keys/owner.key
export MS_CLOUD_STORE_KEY_FILE=/run/workspace-keys/store.key
node js/bin/meta-sovereign.js serve-cloud --store=/var/lib/meta-sovereign/acme
```

Both key files must contain independent 32-byte random values encoded as lowercase hexadecimal. The listener defaults to `127.0.0.1:8787`. To run behind a platform ingress over an isolated network, set `--listen=0.0.0.0` and use the platform's port or `--port`. Enforce egress isolation at the network layer before opening ingress. Restrict tenant processes from connecting to host management, neighboring workloads, private service ranges and cloud metadata. The app is stateful. Run one writer for each store directory and mount the same volume on replacement. A static site, read-only hosting, and a request-only serverless function cannot host the background jobs and persistent store.

## Session and data operations

- Signing out ends the browser session, including its open event streams and WebSockets. Sessions expire after 12 hours and are invalidated on restart. To revoke every session and rotate the access key, replace `owner.key` with a newly generated key from your secret manager and restart the web service. Keep the storage key stable because it decrypts stored connection secrets.
- **Backup** creates encrypted archives of workspace links. For a full recovery including downloaded media, stop the web service and take an encrypted snapshot of the entire workspace volume. Save the configuration and the storage key separately. Restore the volume into the same project or a freshly configured project with the matching storage key and one server writer. Check readiness and sample links and media before switching DNS.
- To retire a workspace, first remove its proxy site and stop its Compose project. If retention policy allows deletion after any required backup, remove that project's data volume and key files. A normal `docker compose down` retains its volume.
- To move an existing local install, stop the original server, transfer its entire store directory to the workspace volume, and secure the files as UID 1000 in Compose. Encrypted provider records must remain decryptable under the original passphrase. For records encrypted with a different passphrase, reconnect the affected providers in the browser or first migrate the credential records under the new storage key. Keep the original backup until the hosted copy is verified.

## Provider capabilities

Telegram account sign-in and code entry, Telegram bots, API providers, server-side email connections, and provider archive uploads remain available according to each provider's existing adapter. Upload vCard contacts from the browser. Server-backed Chat and Operator keep their normal loading, selection, send and recovery behavior, with the provider's actual delivery result.

Opening installed browsers, scanning their signed-in profiles or desktop credential files, and reading an operating system's address book require access to a specific device. Cloud routes report these operations as unavailable. In a hosted workspace, use provider APIs, archive uploads or vCard where supported. Personal WhatsApp Web, live CV browser reads and writes, and marketplace browser capture currently depend on the device flows. Hosted users can import a WhatsApp archive, use the WhatsApp Business API where eligible, compare saved CV data and view saved marketplace profiles. A server or provider failure appears as an unavailable or failed operation.
