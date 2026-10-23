// Fake mail servers on 127.0.0.1 for the email tests (R-Z5): scripted SMTP,
// IMAP and POP3 answers, implicit TLS and STARTTLS with a really verified
// certificate. No real mail server or account is involved.

import { Buffer } from 'node:buffer';
import net from 'node:net';
import tls from 'node:tls';

import { makeLocalCertificate } from '../../src/server/local-tls.js';

// An authority, so that Bun also trusts it as `ca` (the product's own
// certificate is not one).
export const { key, cert } = makeLocalCertificate({ authority: true });

export const MAIL = [
  'Message-ID: <m1@example.com>',
  'From: Alice <alice@example.com>',
  'To: Bob <bob@example.com>',
  'Subject: Hello',
  'Date: Sun, 03 May 2026 10:00:00 +0000',
  '',
  'Hello body',
].join('\r\n');

/**
 * A scripted server. `onLine({ line, socket, state })` answers one line;
 * `greeting` is sent on connect; `mode` is 'plain', 'tls' (implicit) or
 * 'starttls' (the script upgrades with `state.upgrade()`).
 */
export const startServer = async ({
  mode = 'plain',
  greeting,
  onLine,
  onData,
}) => {
  const seen = [];
  const handle = (socket, state) => {
    let buffer = Buffer.alloc(0);
    socket.on('error', () => {});
    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      for (;;) {
        const idx = buffer.indexOf(10);
        if (idx < 0) {
          return;
        }
        const line = buffer
          .subarray(0, idx)
          .toString('latin1')
          .replace(/\r$/, '');
        buffer = buffer.subarray(idx + 1);
        seen.push(line);
        onLine({ line, socket: state.socket, state });
        onData?.(line);
      }
    });
  };
  const server =
    mode === 'tls'
      ? tls.createServer({ key, cert }, (socket) => {
          const state = { socket };
          handle(socket, state);
          if (greeting) {
            socket.write(greeting);
          }
        })
      : net.createServer((socket) => {
          const state = {
            socket,
            // Go on over TLS on the same connection (after STARTTLS).
            upgrade() {
              socket.removeAllListeners('data');
              const secure = new tls.TLSSocket(socket, {
                isServer: true,
                key,
                cert,
              });
              state.socket = secure;
              handle(secure, state);
            },
          };
          handle(socket, state);
          if (greeting) {
            socket.write(greeting);
          }
        });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    port: server.address().port,
    seen,
    close: () =>
      new Promise((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections?.();
      }),
  };
};

export const smtpScript = ({ starttls = false, mechanisms = 'PLAIN' } = {}) => {
  let inData = false;
  const data = [];
  const onLine = ({ line, socket, state }) => {
    if (inData) {
      if (line === '.') {
        inData = false;
        socket.write('250 queued\r\n');
      } else {
        data.push(line);
      }
      return;
    }
    if (line.startsWith('EHLO')) {
      const caps = [
        '250-localhost',
        starttls && !state.secure ? '250-STARTTLS' : null,
        `250 AUTH ${mechanisms}`,
      ].filter(Boolean);
      socket.write(`${caps.join('\r\n')}\r\n`);
    } else if (line === 'STARTTLS') {
      socket.write('220 go ahead\r\n');
      state.secure = true;
      state.upgrade();
    } else if (
      line.startsWith('AUTH PLAIN') ||
      line.startsWith('AUTH XOAUTH2')
    ) {
      socket.write('235 ok\r\n');
    } else if (line.startsWith('MAIL FROM') || line.startsWith('RCPT TO')) {
      socket.write('250 ok\r\n');
    } else if (line === 'DATA') {
      inData = true;
      socket.write('354 go\r\n');
    } else if (line === 'QUIT') {
      socket.write('221 bye\r\n');
      socket.end();
    }
  };
  return { onLine, data };
};

export const mail = {
  from: 'alice@example.com',
  to: 'bob@example.com',
  bcc: 'secret@example.com',
  subject: 'Hello',
  text: 'Hi Bob',
};

export const imapScript = ({
  uids,
  validity = 7,
  uidNext,
  sizes = {},
  trash = false,
}) => {
  const calls = [];
  const onLine = ({ line, socket }) => {
    calls.push(line);
    const tag = line.split(' ')[0];
    const command = line.slice(tag.length + 1);
    if (command.startsWith('LOGIN') || command.startsWith('AUTHENTICATE')) {
      socket.write(`${tag} OK logged in\r\n`);
    } else if (command.startsWith('SELECT')) {
      socket.write(
        `* ${uids.length} EXISTS\r\n* OK [UIDVALIDITY ${validity}] ok\r\n* OK [UIDNEXT ${uidNext ?? Math.max(...uids) + 1}] ok\r\n${tag} OK [READ-WRITE] done\r\n`
      );
    } else if (command === 'UID SEARCH ALL') {
      socket.write(`* SEARCH ${uids.join(' ')}\r\n${tag} OK done\r\n`);
    } else if (command.startsWith('UID SEARCH UID')) {
      const from = Number(command.match(/UID (\d+):\*/)[1]);
      // A server always includes the newest message, even below the range.
      const hit = uids.filter((u) => u >= from);
      const out = hit.length ? hit : [Math.max(...uids)];
      socket.write(`* SEARCH ${out.join(' ')}\r\n${tag} OK done\r\n`);
    } else if (command.includes('RFC822.SIZE')) {
      const set = command
        .match(/FETCH ([\d,]+)/)[1]
        .split(',')
        .map(Number);
      const rows = set.map(
        (u, i) =>
          `* ${i + 1} FETCH (UID ${u} RFC822.SIZE ${sizes[u] ?? MAIL.length})\r\n`
      );
      socket.write(`${rows.join('')}${tag} OK done\r\n`);
    } else if (command.includes('BODY.PEEK[]')) {
      const set = command
        .match(/FETCH ([\d,]+)/)[1]
        .split(',')
        .map(Number);
      const rows = set.map((u, i) => {
        const text = MAIL.replace('m1@', `m${u}@`);
        return `* ${i + 1} FETCH (UID ${u} BODY[] {${Buffer.byteLength(text)}}\r\n${text})\r\n`;
      });
      socket.write(`${rows.join('')}${tag} OK done\r\n`);
    } else if (command === 'CAPABILITY') {
      socket.write(`* CAPABILITY IMAP4rev1 MOVE UIDPLUS\r\n${tag} OK done\r\n`);
    } else if (command.startsWith('LIST')) {
      socket.write(
        trash
          ? `* LIST (\\HasNoChildren) "/" "INBOX"\r\n* LIST (\\HasNoChildren \\Trash) "/" "Deleted Items"\r\n${tag} OK done\r\n`
          : `* LIST (\\HasNoChildren) "/" "INBOX"\r\n${tag} OK done\r\n`
      );
    } else if (command.startsWith('LOGOUT')) {
      socket.write(`* BYE\r\n${tag} OK bye\r\n`);
      socket.end();
    } else {
      socket.write(`${tag} OK done\r\n`);
    }
  };
  return { onLine, calls };
};
