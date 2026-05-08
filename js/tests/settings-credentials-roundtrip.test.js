// Issue #16 / R-O8, R-O3, R-O11: provider credential roundtrip.
//
// End-to-end check that the Connections provider-detail form contract
// holds when the SPA talks to a real `startServer` instance with
// `secretPassphrase`:
//
//   - `api.put({ id: 'secret:telegram:bot-token', value: 'plain' })`
//     persists ciphertext to the on-disk `data.lino`, never plaintext.
//   - `api.links()` (filtered to `secret:*`) round-trips the value.
//   - `credentialsFromLinks(provider, links)` recovers a field-id map
//     that `buildProbeUrl` interpolates into the live Telegram URL.
//   - The probe URL is the *new* template-derived URL, never the broken
//     legacy `/bot/getMe` URL that motivated the issue.

import { describe, it, expect } from 'test-anywhere';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../src/server/index.js';
import {
  buildProbeUrl,
  credentialsFromLinks,
  providerCatalogue,
} from '../src/web/connection-guides.js';

describe('Provider credentials roundtrip (issue #16)', () => {
  it('persists secret:* via api.put, reads it back, and feeds buildProbeUrl', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ms-issue16-'));
    const handle = await startServer({
      port: 0,
      storeDir: dir,
      secretPassphrase: 'top-secret',
    });
    const base = `http://127.0.0.1:${handle.port}`;
    try {
      // The SPA's `api.put` POSTs to /links via the dom.js layer; the
      // shape below is identical to what `<ProviderCredentialsForm>` emits.
      const sampleToken = '123456:ABC-roundtrip-sample';
      const put = await fetch(`${base}/links`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: 'secret:telegram:bot-token',
          tokens: ['secret', 'telegram', 'token'],
          value: sampleToken,
          updated: '2026-05-03T00:00:00.000Z',
        }),
      });
      await put.text();

      // Mirrors api.links() in dom.js: GET /links, filter to secret:*.
      const all = await fetch(`${base}/links`).then((r) => r.json());
      const links = (all ?? []).filter((link) =>
        link.id?.startsWith('secret:')
      );
      expect(links.length).toBe(1);
      expect(links[0].id).toBe('secret:telegram:bot-token');
      expect(links[0].value).toBe(sampleToken);

      // The provider detail recovers a field-id map from secret:* links
      // and hands it to buildProbeUrl unchanged.
      const provider = providerCatalogue.telegram;
      const credentials = credentialsFromLinks(provider, links);
      expect(credentials).toEqual({ token: sampleToken });

      const url = buildProbeUrl({ provider, credentials });
      expect(url).toBe(`https://api.telegram.org/bot${sampleToken}/getMe`);

      // Regression check: must NOT reproduce the broken legacy URL that
      // 404s every time (the original bug behind issue #16).
      expect(url === 'https://api.telegram.org/bot/getMe').toBe(false);

      // Storage-at-rest check: the on-disk store must hold ciphertext,
      // never the plaintext token.
      const linoText = await fs.readFile(path.join(dir, 'data.lino'), 'utf8');
      expect(linoText.includes(sampleToken)).toBe(false);
      expect(linoText.includes('secret:telegram:bot-token')).toBe(true);
    } finally {
      await handle.close();
    }
  });

  it('forgetting a credential clears it from /links', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ms-issue16-'));
    const handle = await startServer({
      port: 0,
      storeDir: dir,
      secretPassphrase: 'top-secret',
    });
    const base = `http://127.0.0.1:${handle.port}`;
    try {
      await fetch(`${base}/links`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: 'secret:telegram:bot-token',
          tokens: ['secret', 'telegram', 'token'],
          value: 'will-be-forgotten',
        }),
      }).then((r) => r.text());

      const before = await fetch(
        `${base}/links/secret:telegram:bot-token`
      ).then((r) => r.json());
      expect(before.value).toBe('will-be-forgotten');

      // Mirrors api.del in dom.js (DELETE /links/:id).
      await fetch(`${base}/links/secret:telegram:bot-token`, {
        method: 'DELETE',
      }).then((r) => r.text());

      const after = await fetch(`${base}/links/secret:telegram:bot-token`);
      expect(after.status).toBe(404);
      // Deno's test runner flags any unread response body as a leak.
      await after.body?.cancel();

      // After forgetting, buildProbeUrl returns null (R-O2: never fire
      // a request when credentials are missing).
      const all = await fetch(`${base}/links`).then((r) => r.json());
      const links = (all ?? []).filter((link) =>
        link.id?.startsWith('secret:')
      );
      const credentials = credentialsFromLinks(
        providerCatalogue.telegram,
        links
      );
      expect(credentials.token).toBeUndefined();
      expect(
        buildProbeUrl({ provider: providerCatalogue.telegram, credentials })
      ).toBeNull();
    } finally {
      await handle.close();
    }
  });
});
