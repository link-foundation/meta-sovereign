/**
 * Sockets for the local mail transport (R-Z5).
 *
 * A mail connection is one of three kinds, and never a silent downgrade:
 *   tls       implicit TLS from the first byte (IMAP 993, POP3 995, SMTP 465);
 *   starttls  plain greeting, then the server must accept STARTTLS (IMAP and
 *             SMTP 143/587/1143/1025, POP3 110) and the rest runs over TLS;
 *   none      no TLS at all, only when asked for by name, and credentials
 *             travel in clear only to this computer (loopback).
 * The server's certificate is always checked. A private CA is given as
 * `ca`; switching the check off is allowed for loopback only (Proton
 * Bridge's self-signed certificate) and only when asked for by name.
 */

import { Buffer } from 'node:buffer';
import net from 'node:net';
import tls from 'node:tls';

const coded = (message, code) => Object.assign(new Error(message), { code });

const falsy = (value) =>
  ['0', 'false', 'no', 'off'].includes(String(value).toLowerCase());
const truthy = (value) =>
  ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());

const STARTTLS_PORTS = new Set([25, 110, 143, 587, 1025, 1143]);

const SECURITY_NAMES = {
  tls: 'tls',
  ssl: 'tls',
  starttls: 'starttls',
  stls: 'starttls',
  none: 'none',
  plain: 'none',
};

/** `tls`, `starttls` or `none` for these settings. */
export const securityOf = ({ security, secure, port }) => {
  const named = SECURITY_NAMES[String(security ?? '').toLowerCase()];
  if (named) {
    return named;
  }
  if (secure !== undefined && secure !== null && secure !== '') {
    return falsy(secure) ? 'starttls' : 'tls';
  }
  return STARTTLS_PORTS.has(Number(port)) ? 'starttls' : 'tls';
};

export const isLoopback = (host) =>
  /^(?:localhost|::1|\[::1\]|127\.\d+\.\d+\.\d+)$/i.test(String(host ?? ''));

/** The options `tls.connect` gets: verified, TLS 1.2 or newer. */
export const tlsOptionsOf = ({ host, ca, rejectUnauthorized }) => {
  const relaxed = rejectUnauthorized !== undefined && falsy(rejectUnauthorized);
  if (relaxed && !isLoopback(host)) {
    throw coded(
      'the certificate check can only be switched off for this computer (127.0.0.1)',
      'insecure-refused'
    );
  }
  return {
    servername: net.isIP(host) ? undefined : host,
    minVersion: 'TLSv1.2',
    rejectUnauthorized: !relaxed,
    ...(ca ? { ca } : {}),
  };
};

/** Credentials go out in clear only to this computer, or when allowed. */
export const guardCleartext = ({ mode, host, hasCredentials, allow }) => {
  if (
    mode === 'none' &&
    hasCredentials &&
    !isLoopback(host) &&
    !(allow !== undefined && truthy(allow))
  ) {
    throw coded(
      `refusing to send the mail password in clear text to ${host}; use TLS or STARTTLS`,
      'insecure-refused'
    );
  }
};

const withTimeout = (socket, ms, label) => {
  const timer = globalThis.setTimeout(() => {
    socket.destroy(new Error(label));
  }, ms);
  return () => globalThis.clearTimeout(timer);
};

export const connectSocket = ({
  host,
  port,
  implicitTls = false,
  tlsOptions = {},
  timeout = 30000,
}) =>
  new Promise((resolve, reject) => {
    if (!host) {
      reject(new Error('email host is required for raw mail transport'));
      return;
    }
    const socket = implicitTls
      ? tls.connect({ host, port, ...tlsOptions })
      : net.connect({ host, port });
    const stop = withTimeout(
      socket,
      timeout,
      'email socket connection timed out'
    );
    const ready = implicitTls ? 'secureConnect' : 'connect';
    const onError = (err) => {
      stop();
      reject(err);
    };
    socket.once('error', onError);
    socket.once(ready, () => {
      stop();
      socket.off('error', onError);
      socket.setNoDelay(true);
      resolve(socket);
    });
  });

export class MailSocket {
  constructor(socket) {
    this.buffer = Buffer.alloc(0);
    this.waiters = [];
    this.ended = false;
    this.attach(socket);
  }

  attach(socket) {
    this.socket = socket;
    socket.on('data', (chunk) => {
      this.buffer = Buffer.concat([this.buffer, Buffer.from(chunk)]);
      this.drain();
    });
    socket.on('error', (err) => this.fail(err));
    socket.on('end', () => {
      this.ended = true;
      this.drain();
    });
  }

  fail(err) {
    const waiters = this.waiters.splice(0);
    for (const waiter of waiters) {
      waiter.reject(err);
    }
  }

  drain() {
    for (const waiter of [...this.waiters]) {
      if (waiter.kind === 'line') {
        const idx = this.buffer.indexOf(10);
        if (idx < 0) {
          continue;
        }
        const raw = this.buffer.subarray(0, idx + 1);
        this.buffer = this.buffer.subarray(idx + 1);
        this.waiters.splice(this.waiters.indexOf(waiter), 1);
        waiter.resolve(
          Buffer.from(raw.toString('latin1').replace(/\r?\n$/, ''), 'latin1')
        );
        continue;
      }
      if (this.buffer.length >= waiter.length) {
        const raw = Buffer.from(this.buffer.subarray(0, waiter.length));
        this.buffer = this.buffer.subarray(waiter.length);
        this.waiters.splice(this.waiters.indexOf(waiter), 1);
        waiter.resolve(raw);
      }
    }
    if (this.ended && this.waiters.length > 0) {
      this.fail(
        coded('email socket closed before response completed', 'socket-closed')
      );
    }
  }

  /** One line as bytes, without its line break. */
  readLineBytes() {
    return new Promise((resolve, reject) => {
      this.waiters.push({ kind: 'line', resolve, reject });
      this.drain();
    });
  }

  /** One line as text (server replies are ASCII or UTF-8). */
  async readLine() {
    return (await this.readLineBytes()).toString('utf8');
  }

  /** `length` bytes (an IMAP literal). */
  readBytes(length) {
    return new Promise((resolve, reject) => {
      this.waiters.push({ kind: 'bytes', length, resolve, reject });
      this.drain();
    });
  }

  writeLine(line = '') {
    this.socket.write(`${line}\r\n`);
  }

  writeRaw(data) {
    this.socket.write(data);
  }

  /**
   * Go on over TLS on the same connection (after STARTTLS was accepted).
   * Bytes the server sent ahead of the upgrade would be read as if they
   * were encrypted, so any are refused.
   */
  async upgrade(tlsOptions, timeout = 30000) {
    if (this.buffer.length > 0) {
      throw coded(
        'unexpected data before STARTTLS completed',
        'starttls-failed'
      );
    }
    const plain = this.socket;
    plain.removeAllListeners('data');
    plain.removeAllListeners('error');
    plain.removeAllListeners('end');
    const secure = tls.connect({ socket: plain, ...tlsOptions });
    await new Promise((resolve, reject) => {
      const stop = withTimeout(secure, timeout, 'STARTTLS timed out');
      secure.once('secureConnect', () => {
        stop();
        resolve();
      });
      secure.once('error', (err) => {
        stop();
        reject(err);
      });
    });
    this.attach(secure);
  }

  close() {
    this.socket.end();
  }
}
