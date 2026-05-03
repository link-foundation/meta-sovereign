/**
 * Master-key vault (R-K7 … R-K12).
 *
 * The vault holds a single random 256-bit master key on disk, *wrapped*
 * by one or more "unlock methods". A user can add a passphrase, a PIN,
 * a passkey-derived secret (WebAuthn `prf` extension produces a 32-byte
 * blob the browser passes in here), and an authenticator-app TOTP
 * recovery code. Each method derives its own key via scrypt and seals
 * a copy of the master key with AES-256-GCM, so adding or removing an
 * unlock method only re-wraps the master key — none of the data on
 * disk needs to be re-encrypted (R-K10).
 *
 * On disk the vault is a JSON document at a path of the caller's
 * choice (the server uses `<storeDir>/vault.json`). The schema is:
 *
 *     {
 *       "kind": "meta-sovereign-vault",
 *       "version": 1,
 *       "createdAt": "<iso>",
 *       "unlocks": [
 *         {
 *           "id": "<random-12-byte-hex>",
 *           "label": "passphrase",
 *           "kind": "passphrase" | "pin" | "passkey" | "totp-recovery",
 *           "kdf": { "name": "scrypt", "N": 16384, "r": 8, "p": 1 },
 *           "salt": "<base64>",
 *           "iv": "<base64>",
 *           "tag": "<base64>",
 *           "wrapped": "<base64 wrapped master key>",
 *           "addedAt": "<iso>"
 *         },
 *         ...
 *       ]
 *     }
 *
 * The plaintext master key never touches disk. `unlock()` reads the
 * file, finds an entry whose secret matches, and returns a handle that
 * exposes `encrypt(plaintext)` / `decrypt(envelope)` — both call into
 * the same AES-256-GCM scheme used by `encryptBackup`, so envelopes
 * produced by the vault can be opened by `decryptBackup` if you give
 * it the master key as the passphrase (the `kdf` step then becomes a
 * no-op key reuse — see `encryptWithKey`).
 *
 * Loss of all unlock methods means loss of access to the data (R-K12).
 * That is intentional — there is no recovery backdoor.
 */

import { promises as fs } from 'node:fs';
import {
  randomBytes,
  scryptSync,
  createCipheriv,
  createDecipheriv,
  timingSafeEqual,
} from 'node:crypto';

const VAULT_VERSION = 1;
const KDF_N = 1 << 14;
const KEY_BYTES = 32;
const IV_BYTES = 12;
const SALT_BYTES = 16;
const ID_BYTES = 12;

const KIND_LABELS = new Set(['passphrase', 'pin', 'passkey', 'totp-recovery']);

const deriveKey = (secret, salt) =>
  scryptSync(secret, salt, KEY_BYTES, { N: KDF_N });

const encodeSecret = (secret) => {
  if (secret instanceof Uint8Array) {
    return Buffer.from(secret);
  }
  if (typeof secret === 'string') {
    return Buffer.from(secret, 'utf8');
  }
  throw new Error('vault: unlock secret must be a string or Uint8Array');
};

const validateKind = (kind) => {
  if (!KIND_LABELS.has(kind)) {
    throw new Error(
      `vault: unknown unlock kind ${kind} (expected one of ${[...KIND_LABELS].join(', ')})`
    );
  }
};

const wrap = (masterKey, secret) => {
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const key = deriveKey(encodeSecret(secret), salt);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(masterKey), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    kdf: { name: 'scrypt', N: KDF_N, r: 8, p: 1 },
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    wrapped: ct.toString('base64'),
  };
};

const unwrap = (entry, secret) => {
  const key = deriveKey(
    encodeSecret(secret),
    Buffer.from(entry.salt, 'base64')
  );
  const decipher = createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(entry.iv, 'base64')
  );
  decipher.setAuthTag(Buffer.from(entry.tag, 'base64'));
  try {
    return Buffer.concat([
      decipher.update(Buffer.from(entry.wrapped, 'base64')),
      decipher.final(),
    ]);
  } catch {
    return null;
  }
};

const emptyVault = () => ({
  kind: 'meta-sovereign-vault',
  version: VAULT_VERSION,
  createdAt: new Date().toISOString(),
  unlocks: [],
});

const readVault = async (file) => {
  try {
    const raw = await fs.readFile(file, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed.kind !== 'meta-sovereign-vault') {
      throw new Error(
        `vault: not a meta-sovereign vault (kind=${parsed.kind})`
      );
    }
    return parsed;
  } catch (err) {
    if (err.code === 'ENOENT') {
      return null;
    }
    throw err;
  }
};

const writeVault = async (file, vault) =>
  fs.writeFile(file, JSON.stringify(vault, null, 2), 'utf8');

/**
 * AES-256-GCM with a *given* key (no KDF). Used by the unlocked vault
 * to seal/open arbitrary blobs without re-deriving on every call.
 * Envelope shape mirrors `encryptBackup` so we can reuse decoders.
 */
export const encryptWithKey = (plaintext, masterKey) => {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', masterKey, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return JSON.stringify({
    version: VAULT_VERSION,
    cipher: 'aes-256-gcm',
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ct: ct.toString('base64'),
  });
};

export const decryptWithKey = (envelopeJson, masterKey) => {
  const env = JSON.parse(envelopeJson);
  if (env.cipher !== 'aes-256-gcm') {
    throw new Error(`vault: unsupported cipher ${env.cipher}`);
  }
  const decipher = createDecipheriv(
    'aes-256-gcm',
    masterKey,
    Buffer.from(env.iv, 'base64')
  );
  decipher.setAuthTag(Buffer.from(env.tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(env.ct, 'base64')),
    decipher.final(),
  ]).toString('utf8');
};

/**
 * Create a vault handle bound to a file path. The file does not need
 * to exist yet — call `initialize({ kind, secret, label })` to create
 * it with the first unlock method.
 */
export const createVault = ({ file }) => {
  if (typeof file !== 'string' || file.length === 0) {
    throw new Error('createVault: file path is required');
  }
  let unlocked = null; // Buffer master key while unlocked

  const load = () => readVault(file);

  const initialize = async ({ kind, secret, label = kind }) => {
    validateKind(kind);
    const existing = await load();
    if (existing) {
      throw new Error('vault: already initialized — call addUnlock instead');
    }
    const masterKey = randomBytes(KEY_BYTES);
    const wrapped = wrap(masterKey, secret);
    const vault = emptyVault();
    vault.unlocks.push({
      id: randomBytes(ID_BYTES).toString('hex'),
      label,
      kind,
      ...wrapped,
      addedAt: new Date().toISOString(),
    });
    await writeVault(file, vault);
    unlocked = masterKey;
    return { unlocks: vault.unlocks.map(toPublic) };
  };

  const unlock = async ({ secret }) => {
    const vault = await load();
    if (!vault) {
      throw new Error('vault: not initialized');
    }
    for (const entry of vault.unlocks) {
      const candidate = unwrap(entry, secret);
      if (
        candidate &&
        candidate.length === KEY_BYTES &&
        timingSafeEqual(candidate, candidate)
      ) {
        unlocked = candidate;
        return { kind: entry.kind, label: entry.label };
      }
    }
    throw new Error('vault: no unlock method matched the supplied secret');
  };

  const lock = () => {
    if (unlocked) {
      unlocked.fill(0);
    }
    unlocked = null;
  };

  const requireUnlocked = () => {
    if (!unlocked) {
      throw new Error('vault: locked — call unlock() first');
    }
  };

  const addUnlock = async ({ kind, secret, label = kind }) => {
    validateKind(kind);
    requireUnlocked();
    const vault = (await load()) ?? emptyVault();
    const wrapped = wrap(unlocked, secret);
    const entry = {
      id: randomBytes(ID_BYTES).toString('hex'),
      label,
      kind,
      ...wrapped,
      addedAt: new Date().toISOString(),
    };
    vault.unlocks.push(entry);
    await writeVault(file, vault);
    return toPublic(entry);
  };

  const removeUnlock = async ({ id }) => {
    const vault = await load();
    if (!vault) {
      throw new Error('vault: not initialized');
    }
    const remaining = vault.unlocks.filter((u) => u.id !== id);
    if (remaining.length === vault.unlocks.length) {
      return false;
    }
    if (remaining.length === 0) {
      throw new Error(
        'vault: refusing to remove the last unlock method — would lock data forever'
      );
    }
    vault.unlocks = remaining;
    await writeVault(file, vault);
    return true;
  };

  const listUnlocks = async () => {
    const vault = await load();
    if (!vault) {
      return [];
    }
    return vault.unlocks.map(toPublic);
  };

  const isUnlocked = () => Boolean(unlocked);

  const encrypt = (plaintext) => {
    requireUnlocked();
    return encryptWithKey(plaintext, unlocked);
  };

  const decrypt = (envelopeJson) => {
    requireUnlocked();
    return decryptWithKey(envelopeJson, unlocked);
  };

  return {
    initialize,
    unlock,
    lock,
    addUnlock,
    removeUnlock,
    listUnlocks,
    isUnlocked,
    encrypt,
    decrypt,
  };
};

const toPublic = (entry) => ({
  id: entry.id,
  kind: entry.kind,
  label: entry.label,
  addedAt: entry.addedAt,
});

export const VAULT_KINDS = Object.freeze([...KIND_LABELS]);
