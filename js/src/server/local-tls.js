/**
 * HTTPS on the server's own port, for Safari (R-Y64).
 *
 * Safari keeps an https page — the hosted app — from http://127.0.0.1
 * and http://localhost alike, but lets it reach https://127.0.0.1 with
 * a certificate it trusts. So the server makes one certificate of its
 * own, for localhost, 127.0.0.1 and ::1 only (it is no authority and
 * cannot stand for any other site), keeps it in `<store>/tls/`, and
 * answers TLS on the same port as plain HTTP: the first byte of each
 * connection tells them apart. The person trusts the certificate once
 * (`meta-sovereign trust`, or Safari's "visit this website" on
 * https://127.0.0.1:8787/trust), and the hosted app then finds the
 * server at https://127.0.0.1:8787 by itself (../web/discover.js).
 *
 * The certificate is written by hand in DER with node:crypto, so no
 * package and no openssl is needed.
 */

import crypto from 'node:crypto';
import { promises as fs } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import http2 from 'node:http2';
import { DIR_MODE, tighten, writeFileDurable } from '../storage/durable.js';
import {
  certificateFingerprint,
  createDeviceKeyProtector,
  isDeviceKey,
  unlockLocalKey,
} from './local-key.js';

const DAY_MS = 24 * 60 * 60 * 1000;
// Apple accepts a trusted server certificate for at most 825 days.
const VALID_DAYS = 800;
// A certificate this close to its end is made anew.
const RENEW_DAYS = 30;
const NAME = 'meta-sovereign local server';

// ---- DER, as much as one certificate needs -----------------------------

const lengthOf = (n) => {
  if (n < 0x80) {
    return Buffer.from([n]);
  }
  const bytes = [];
  for (let left = n; left > 0; left >>= 8) {
    bytes.unshift(left & 0xff);
  }
  return Buffer.from([0x80 | bytes.length, ...bytes]);
};
const tlv = (tag, ...parts) => {
  const body = Buffer.concat(parts);
  return Buffer.concat([Buffer.from([tag]), lengthOf(body.length), body]);
};
const seq = (...parts) => tlv(0x30, ...parts);
const set = (...parts) => tlv(0x31, ...parts);
const explicit = (n, ...parts) => tlv(0xa0 + n, ...parts);
const octets = (buf) => tlv(0x04, buf);
const bits = (buf, unused = 0) => tlv(0x03, Buffer.from([unused]), buf);
const yes = tlv(0x01, Buffer.from([0xff]));
const integer = (buf) =>
  tlv(0x02, buf[0] & 0x80 ? Buffer.concat([Buffer.from([0]), buf]) : buf);
const oid = (dotted) => {
  const [a, b, ...rest] = dotted.split('.').map(Number);
  const bytes = [40 * a + b];
  for (const n of rest) {
    const part = [n & 0x7f];
    for (let left = Math.floor(n / 128); left > 0; left >>= 7) {
      part.unshift((left & 0x7f) | 0x80);
    }
    bytes.push(...part);
  }
  return tlv(0x06, Buffer.from(bytes));
};
const time = (date) => {
  const iso = date.toISOString().replace(/[-:T]/g, '').slice(0, 14);
  return date.getUTCFullYear() < 2050
    ? tlv(0x17, Buffer.from(`${iso.slice(2)}Z`))
    : tlv(0x18, Buffer.from(`${iso}Z`));
};
const extension = (id, value, critical = false) =>
  seq(oid(id), ...(critical ? [yes] : []), octets(value));

const ECDSA_SHA256 = seq(oid('1.2.840.10045.4.3.2'));
const LOOPBACK_V6 = Buffer.alloc(16);
LOOPBACK_V6[15] = 1;

const pemOf = (label, der) =>
  `-----BEGIN ${label}-----\n${der
    .toString('base64')
    .match(/.{1,64}/g)
    .join('\n')}\n-----END ${label}-----\n`;

/**
 * A new key and self-signed certificate for localhost, 127.0.0.1 and
 * ::1: `{ key, cert }` in PEM. `authority` (tests only) marks it as a CA,
 * which Bun needs before it trusts a self-signed certificate given as `ca`.
 */
export const makeLocalCertificate = ({
  now = Date.now(),
  authority = false,
} = {}) => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
  });
  const spki = publicKey.export({ type: 'spki', format: 'der' });
  const name = seq(set(seq(oid('2.5.4.3'), tlv(0x0c, Buffer.from(NAME)))));
  const serial = crypto.randomBytes(16);
  // Positive and with no leading zero byte: strict DER readers (Bun's
  // BoringSSL, Apple's) refuse a padded INTEGER.
  serial[0] = (serial[0] & 0x3f) | 0x40;
  const tbs = seq(
    explicit(0, integer(Buffer.from([2]))),
    integer(serial),
    ECDSA_SHA256,
    name,
    seq(
      time(new Date(now - DAY_MS)),
      time(new Date(now + VALID_DAYS * DAY_MS))
    ),
    name,
    spki,
    explicit(
      3,
      seq(
        // not an authority, unless a test needs one
        extension('2.5.29.19', authority ? seq(yes) : seq(), true),
        extension(
          '2.5.29.15',
          authority
            ? bits(Buffer.from([0x84]), 1) // signs and signs certificates
            : bits(Buffer.from([0x80]), 7),
          true
        ),
        extension('2.5.29.37', seq(oid('1.3.6.1.5.5.7.3.1'))), // serves TLS
        extension(
          '2.5.29.17', // these names only
          seq(
            tlv(0x82, Buffer.from('localhost')),
            tlv(0x87, Buffer.from([127, 0, 0, 1])),
            tlv(0x87, LOOPBACK_V6)
          )
        ),
        extension(
          '2.5.29.14',
          octets(crypto.createHash('sha1').update(spki).digest())
        )
      )
    )
  );
  const signature = crypto.sign('sha256', tbs, privateKey);
  return {
    key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    cert: pemOf('CERTIFICATE', seq(tbs, ECDSA_SHA256, bits(signature))),
  };
};

const usable = (cert, key, now) => {
  try {
    const x509 = new crypto.X509Certificate(cert);
    return (
      !x509.ca &&
      x509.verify(x509.publicKey) &&
      x509.checkPrivateKey(crypto.createPrivateKey(key)) &&
      Date.parse(x509.validFrom) <= now &&
      Date.parse(x509.validTo) - now > RENEW_DAYS * DAY_MS &&
      x509.subjectAltName?.split(', ').length === 3 &&
      x509.subjectAltName.includes('DNS:localhost') &&
      x509.subjectAltName.includes('IP Address:127.0.0.1') &&
      (x509.subjectAltName.includes('IP Address:0:0:0:0:0:0:0:1') ||
        x509.subjectAltName.includes('IP Address:::1'))
    );
  } catch {
    return false;
  }
};

/** Where the certificate of a store lives. */
export const localTlsPaths = (storeDir) => {
  const dir = path.join(storeDir, 'tls');
  return {
    dir,
    key: path.join(dir, 'localhost.key'),
    cert: path.join(dir, 'localhost.crt'),
  };
};

/**
 * The store's certificate, made (or made anew near its end) when
 * needed: `{ key, cert, certPath, made }`. The key is readable by its
 * owner only.
 */
export const loadLocalTls = async (
  storeDir,
  { now = Date.now(), protector } = {}
) => {
  const paths = localTlsPaths(storeDir);
  const [encoded, diskCert] = await Promise.all([
    fs.readFile(paths.key, 'utf8').catch(() => null),
    fs.readFile(paths.cert, 'utf8').catch(() => null),
  ]);
  // The key is private whatever mode an older version created it with (R-Z2).
  await tighten(paths.key);
  await tighten(paths.dir, DIR_MODE);
  const deviceKey = isDeviceKey(encoded);
  // Keep the certificate with its sealed key so a crash between the two
  // file renames can recover the pair without replacing the trusted key.
  const cert = deviceKey
    ? (JSON.parse(encoded).certificate ?? diskCert)
    : diskCert;
  const protection =
    protector ?? (deviceKey ? await createDeviceKeyProtector(storeDir) : null);
  const key = deviceKey
    ? await unlockLocalKey(encoded, cert, protection)
    : encoded;
  const finish = async (pair, made) => {
    const sealed = Boolean(protection);
    if (made || (sealed && !deviceKey)) {
      const saved = sealed
        ? JSON.stringify({
            ...(await protection.seal(
              pair.key,
              certificateFingerprint(pair.cert)
            )),
            certificate: pair.cert,
          })
        : pair.key;
      await writeFileDurable(paths.key, saved);
    }
    if (made || diskCert !== pair.cert) {
      await writeFileDurable(paths.cert, pair.cert);
    }
    return {
      ...pair,
      certPath: paths.cert,
      made,
      protection: sealed ? 'secure-enclave' : 'file',
      fingerprint: certificateFingerprint(pair.cert),
    };
  };
  if (key && cert && usable(cert, key, now)) {
    return finish({ key, cert }, false);
  }
  const fresh = makeLocalCertificate({ now });
  await fs.mkdir(paths.dir, { recursive: true, mode: 0o700 });
  return finish(fresh, true);
};

/** Whether this runtime can share one port between HTTP and HTTPS. */
export const canShareTlsPort = () =>
  typeof globalThis.Bun === 'undefined' &&
  typeof globalThis.Deno === 'undefined';

// A TLS connection starts with a handshake record.
const HANDSHAKE = 0x16;

/**
 * Listen on `port` for both plain HTTP and HTTPS, both handled by
 * `httpServer`. Resolves the front server (its `address()`, `close()`).
 */
export const listenHttpAndHttps = (
  httpServer,
  { key, cert },
  port,
  host = '127.0.0.1'
) =>
  new Promise((resolve, reject) => {
    // Multiplex API calls, media and event streams over HTTPS. HTTP/1's six
    // browser connections can otherwise all wait behind long media downloads.
    const secure = http2.createSecureServer(
      { key, cert, allowHTTP1: true },
      (req, res) => {
        // Keep the existing strict Host and Origin checks for HTTP/2 too.
        req.headers.host ??= req.headers[':authority'];
        httpServer.emit('request', req, res);
      }
    );
    secure.requestTimeout = httpServer.requestTimeout;
    secure.on('upgrade', (req, socket, head) =>
      httpServer.emit('upgrade', req, socket, head)
    );
    // A browser that does not trust the certificate yet hangs up.
    secure.on('tlsClientError', () => {});
    const front = net.createServer((socket) => {
      socket.on('error', () => {});
      socket.once('data', (first) => {
        socket.pause();
        socket.unshift(first);
        (first[0] === HANDSHAKE ? secure : httpServer).emit(
          'connection',
          socket
        );
        process.nextTick(() => socket.resume());
      });
    });
    front.once('error', reject);
    front.listen(port, host, () => {
      front.off('error', reject);
      resolve(front);
    });
  });

/**
 * Listen as the server does: HTTPS beside HTTP on the same port when
 * `tls` is asked for and the runtime can share it, plain HTTP otherwise.
 * Certificate or device-key failures reject instead of downgrading.
 * Resolves `{ listener, tls }`
 * with `tls` as `{ certPath }` or null.
 */
export const listenLocal = async (
  server,
  { port, storeDir, tls: wanted = false, log }
) => {
  if (wanted && storeDir && canShareTlsPort()) {
    let local;
    try {
      local = await loadLocalTls(storeDir);
    } catch (error) {
      log?.({ level: 'error', event: 'tls_failed', error: error.message });
      throw error; // A locked or copied device key must never downgrade to HTTP.
    }
    if (local) {
      if (local.made) {
        log?.({ event: 'tls_certificate_made', path: local.certPath });
      }
      const listener = await listenHttpAndHttps(server, local, port);
      return {
        listener,
        tls: {
          certPath: local.certPath,
          fingerprint: local.fingerprint,
          protection: local.protection,
        },
      };
    }
  }
  // A busy port rejects (it used to hang for ever, R-Z1).
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  return { listener: server, tls: null };
};
