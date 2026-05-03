/**
 * Encrypted-at-rest decorator for `secret:*` links (R-J9 / ROADMAP §8).
 *
 * `wrapSecretStore({ inner, passphrase })` returns a Universal Links
 * Access store that transparently encrypts/decrypts the payload of any
 * link whose `id` starts with `secret:`. Non-secret links pass through
 * untouched so contacts, messages, patterns etc. keep their normal
 * shape (the universal store invariant — the data store IS the API —
 * stays intact).
 *
 * Cipher: AES-256-GCM, scrypt(N=2^14)-derived key, random salt + IV per
 * write. The ciphertext envelope is the same JSON shape the encrypted
 * backup format already uses (see `encryptBackup`/`decryptBackup` in
 * `./backup.js`) so a single passphrase decrypts both surfaces.
 *
 * On disk the encrypted link looks like:
 *   { id: 'secret:telegram:bot-token',
 *     tokens: ['secret', 'telegram', 'bot-token'], // id parts only
 *     enc: '{"version":1,"cipher":"aes-256-gcm",...}' }
 *
 * `tokens` is regenerated from the id so it carries no plaintext, but
 * the binary store can still index/range-scan by id without knowing
 * the passphrase. The original `tokens`, `body`, `value`, etc. live
 * inside `enc` and are restored on read.
 *
 * If no passphrase is provided, `wrapSecretStore` returns the inner
 * store unchanged — encryption is opt-in via `MS_SECRET_PASSPHRASE`
 * (or the `passphrase` option on `startServer`).
 */

import { encryptBackup, decryptBackup } from './backup.js';

const SECRET_PREFIX = 'secret:';

const isSecret = (link) =>
  link && typeof link.id === 'string' && link.id.startsWith(SECRET_PREFIX);

const idTokens = (id) => id.split(':');

const sealLink = (link, passphrase) => {
  const { id, ...rest } = link;
  const enc = encryptBackup(JSON.stringify(rest), passphrase);
  return { id, tokens: idTokens(id), enc };
};

const openLink = (link, passphrase) => {
  if (!link || typeof link.enc !== 'string') {
    return link;
  }
  const rest = JSON.parse(decryptBackup(link.enc, passphrase));
  return { id: link.id, ...rest };
};

export const wrapSecretStore = ({ inner, passphrase }) => {
  if (!passphrase) {
    return inner;
  }
  return {
    async put(link) {
      if (isSecret(link)) {
        const sealed = sealLink(link, passphrase);
        await inner.put(sealed);
        return link;
      }
      return inner.put(link);
    },
    async get(id) {
      const raw = await inner.get(id);
      if (!raw) {
        return raw;
      }
      if (id.startsWith(SECRET_PREFIX) && raw.enc) {
        return openLink(raw, passphrase);
      }
      return raw;
    },
    async delete(id) {
      return inner.delete(id);
    },
    async query(filter) {
      const all = await inner.query();
      const opened = all.map((l) =>
        l.id.startsWith(SECRET_PREFIX) && l.enc ? openLink(l, passphrase) : l
      );
      return filter ? opened.filter(filter) : opened;
    },
    subscribe(handler) {
      return inner.subscribe((event) => {
        if (event.link && isSecret(event.link) && event.link.enc) {
          handler({ ...event, link: openLink(event.link, passphrase) });
          return;
        }
        handler(event);
      });
    },
  };
};

export const isSecretLinkId = (id) =>
  typeof id === 'string' && id.startsWith(SECRET_PREFIX);
