// The local mail transport against fake servers on 127.0.0.1 (R-Z5):
// implicit TLS and STARTTLS with a really verified certificate, no silent
// downgrade, XOAUTH2, no Bcc on the wire, the unknown-send rule,
// incremental IMAP/POP3 pulls, mark read and move to Trash. No real mail
// server or account is involved.

import { Buffer } from 'node:buffer';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createNodeEmailTransport } from '../src/sources/email-node-transport.js';
import {
  MAIL,
  cert,
  imapScript,
  mail,
  smtpScript,
  startServer,
} from './helpers/mail-fakes.mjs';

describe('SMTP security', () => {
  it('sends over implicit TLS with the certificate verified, Bcc as RCPT only', async () => {
    const script = smtpScript();
    const server = await startServer({
      mode: 'tls',
      greeting: '220 ready\r\n',
      onLine: script.onLine,
    });
    try {
      const transport = createNodeEmailTransport({
        protocol: 'smtp',
        host: '127.0.0.1',
        port: server.port,
        security: 'tls',
        ca: cert,
        username: 'alice',
        password: 'secret',
      });
      const result = await transport.post(mail, { protocol: 'smtp' });
      assert.deepEqual(result.accepted, [
        'bob@example.com',
        'secret@example.com',
      ]);
      assert.ok(server.seen.includes('RCPT TO:<secret@example.com>'));
      assert.doesNotMatch(script.data.join('\n'), /bcc|secret@example\.com/i);
      assert.match(script.data.join('\n'), /^Message-ID: <.+@example\.com>$/m);
      assert.match(script.data.join('\n'), /^Date: /m);
      assert.equal(result.messageId.startsWith('<'), true);
    } finally {
      await server.close();
    }
  });

  it('refuses a certificate it cannot verify (no silent insecure mode)', async () => {
    const script = smtpScript();
    const server = await startServer({
      mode: 'tls',
      greeting: '220 ready\r\n',
      onLine: script.onLine,
    });
    try {
      const transport = createNodeEmailTransport({
        protocol: 'smtp',
        host: '127.0.0.1',
        port: server.port,
        security: 'tls',
        username: 'alice',
        password: 'secret',
      });
      await assert.rejects(
        transport.post(mail, { protocol: 'smtp' }),
        (error) =>
          /self.signed|unable to verify|certificate/i.test(error.message)
      );
      assert.equal(server.seen.length, 0, 'no credentials were sent');
    } finally {
      await server.close();
    }
  });

  it('upgrades with STARTTLS before it logs in', async () => {
    const script = smtpScript({ starttls: true });
    const server = await startServer({
      mode: 'starttls',
      greeting: '220 ready\r\n',
      onLine: script.onLine,
    });
    try {
      const transport = createNodeEmailTransport({
        protocol: 'smtp',
        host: '127.0.0.1',
        port: server.port,
        security: 'starttls',
        ca: cert,
        username: 'alice',
        password: 'secret',
      });
      await transport.post(mail, { protocol: 'smtp' });
      const startAt = server.seen.indexOf('STARTTLS');
      const authAt = server.seen.findIndex((l) => l.startsWith('AUTH'));
      assert.ok(startAt >= 0 && authAt > startAt);
      // PLAIN: the password is in one line, after the upgrade only.
      assert.ok(server.seen[authAt].startsWith('AUTH PLAIN'));
    } finally {
      await server.close();
    }
  });

  it('fails when STARTTLS is required but not offered, sending nothing secret', async () => {
    const script = smtpScript({ starttls: false });
    const server = await startServer({
      mode: 'plain',
      greeting: '220 ready\r\n',
      onLine: script.onLine,
    });
    try {
      const transport = createNodeEmailTransport({
        protocol: 'smtp',
        host: '127.0.0.1',
        port: server.port,
        security: 'starttls',
        username: 'alice',
        password: 'secret',
      });
      await assert.rejects(
        transport.post(mail, { protocol: 'smtp' }),
        (error) => error.code === 'starttls-unsupported'
      );
      assert.ok(!server.seen.some((l) => l.startsWith('AUTH')));
    } finally {
      await server.close();
    }
  });
});

describe('SMTP downgrade and clear text', () => {
  it('treats the old secure:false as "STARTTLS required", not as plain text', async () => {
    const script = smtpScript();
    const server = await startServer({
      greeting: '220 ready\r\n',
      onLine: script.onLine,
    });
    try {
      const transport = createNodeEmailTransport({
        protocol: 'smtp',
        host: '127.0.0.1',
        port: server.port,
        secure: false,
        username: 'alice',
        password: 'secret',
      });
      await assert.rejects(
        transport.post(mail, { protocol: 'smtp' }),
        (error) => error.code === 'starttls-unsupported'
      );
    } finally {
      await server.close();
    }
  });

  it('refuses to send a password in clear text to another host', async () => {
    const transport = createNodeEmailTransport({
      protocol: 'smtp',
      host: '192.0.2.1',
      security: 'none',
      username: 'alice',
      password: 'secret',
    });
    await assert.rejects(
      transport.post(mail, { protocol: 'smtp' }),
      (error) => error.code === 'insecure-refused'
    );
  });

  it('allows the certificate check off for this computer only', async () => {
    const transport = createNodeEmailTransport({
      protocol: 'smtp',
      host: 'mail.example.com',
      security: 'tls',
      rejectUnauthorized: false,
      username: 'alice',
      password: 'secret',
    });
    await assert.rejects(
      transport.post(mail, { protocol: 'smtp' }),
      (error) => error.code === 'insecure-refused'
    );
  });
});

describe('SMTP login and envelope', () => {
  it('logs in with XOAUTH2 when there is a token and no password', async () => {
    const script = smtpScript({ mechanisms: 'XOAUTH2' });
    const server = await startServer({
      greeting: '220 ready\r\n',
      onLine: script.onLine,
    });
    try {
      const transport = createNodeEmailTransport({
        protocol: 'smtp',
        host: '127.0.0.1',
        port: server.port,
        security: 'none',
        username: 'alice@example.com',
        token: 'ya29.token',
      });
      await transport.post(mail, { protocol: 'smtp' });
      const line = server.seen.find((l) => l.startsWith('AUTH XOAUTH2'));
      const decoded = Buffer.from(line.split(' ')[2], 'base64').toString();
      assert.equal(
        decoded,
        'user=alice@example.com\u0001auth=Bearer ya29.token\u0001\u0001'
      );
    } finally {
      await server.close();
    }
  });

  it('rejects an envelope sender or recipient that would add an SMTP command', async () => {
    const script = smtpScript();
    const server = await startServer({
      greeting: '220 ready\r\n',
      onLine: script.onLine,
    });
    try {
      const transport = createNodeEmailTransport({
        protocol: 'smtp',
        host: '127.0.0.1',
        port: server.port,
        security: 'none',
        username: 'alice',
        password: 'secret',
      });
      for (const bad of [
        { ...mail, from: 'a@x.org>\r\nRCPT TO:<evil@x.org' },
        { ...mail, to: 'b@x.org>\r\nRCPT TO:<evil@x.org' },
      ]) {
        await assert.rejects(
          transport.post(bad, { protocol: 'smtp' }),
          (error) => error.code === 'bad-address'
        );
      }
      assert.ok(!server.seen.some((l) => /evil@x\.org/.test(l)));
    } finally {
      await server.close();
    }
  });

  it('answers send-unknown, never a retry, when the line drops after DATA', async () => {
    let inData = false;
    const server = await startServer({
      greeting: '220 ready\r\n',
      onLine: ({ line, socket }) => {
        if (inData) {
          if (line === '.') {
            socket.destroy();
          }
          return;
        }
        if (line.startsWith('EHLO')) {
          socket.write('250 localhost\r\n');
        } else if (line === 'DATA') {
          inData = true;
          socket.write('354 go\r\n');
        } else if (line.startsWith('MAIL') || line.startsWith('RCPT')) {
          socket.write('250 ok\r\n');
        }
      },
    });
    try {
      const transport = createNodeEmailTransport({
        protocol: 'smtp',
        host: '127.0.0.1',
        port: server.port,
        security: 'none',
      });
      await assert.rejects(
        transport.post({ ...mail, bcc: undefined }, { protocol: 'smtp' }),
        (error) => error.code === 'send-unknown' && error.fallback === false
      );
      assert.equal(server.seen.filter((l) => l === 'DATA').length, 1);
    } finally {
      await server.close();
    }
  });
});

const imapTransport = (port, extra = {}) =>
  createNodeEmailTransport({
    protocol: 'imap',
    host: '127.0.0.1',
    port,
    security: 'none',
    username: 'alice',
    password: 'secret',
    ...extra,
  });

describe('IMAP pulls are incremental', () => {
  it('remembers UIDVALIDITY and the last UID, and fetches only what is new', async () => {
    const script = imapScript({ uids: [1, 2, 3, 4] });
    const server = await startServer({
      greeting: '* OK ready\r\n',
      onLine: script.onLine,
    });
    try {
      const transport = imapTransport(server.port);
      const first = await transport.pullMessages({
        protocol: 'imap',
        limit: 2,
      });
      assert.deepEqual(first.state, { uidValidity: 7, lastUid: 4 });
      assert.equal(first.links.length, 2);
      assert.deepEqual(
        first.links.map((l) => l.raw.uid),
        [3, 4]
      );
      assert.equal(first.links[0].raw.mailbox, 'INBOX');

      // Nothing new: the search is only for what came after UID 4.
      script.calls.length = 0;
      const none = await transport.pullMessages({
        protocol: 'imap',
        since: first.state,
      });
      assert.equal(none.links.length, 0);
      assert.ok(script.calls.some((c) => c.includes('UID SEARCH UID 5:*')));
      assert.ok(!script.calls.some((c) => c.includes('BODY.PEEK')));
      assert.deepEqual(none.state, first.state);
    } finally {
      await server.close();
    }

    const more = imapScript({ uids: [1, 2, 3, 4, 5, 6] });
    const server2 = await startServer({
      greeting: '* OK ready\r\n',
      onLine: more.onLine,
    });
    try {
      const result = await imapTransport(server2.port).pullMessages({
        protocol: 'imap',
        since: { uidValidity: 7, lastUid: 4 },
      });
      assert.deepEqual(
        result.links.map((l) => l.raw.uid),
        [5, 6]
      );
      assert.deepEqual(result.state, { uidValidity: 7, lastUid: 6 });
      assert.ok(more.calls.some((c) => c.includes('UID FETCH 5,6')));
    } finally {
      await server2.close();
    }
  });

  it('starts over when the mailbox was renumbered (UIDVALIDITY changed)', async () => {
    const script = imapScript({ uids: [1, 2], validity: 99 });
    const server = await startServer({
      greeting: '* OK ready\r\n',
      onLine: script.onLine,
    });
    try {
      const result = await imapTransport(server.port).pullMessages({
        protocol: 'imap',
        since: { uidValidity: 7, lastUid: 2 },
      });
      assert.ok(script.calls.some((c) => c.includes('UID SEARCH ALL')));
      assert.equal(result.links.length, 2);
      assert.deepEqual(result.state, { uidValidity: 99, lastUid: 2 });
    } finally {
      await server.close();
    }
  });

  it('skips a message above the size cap instead of loading it', async () => {
    const script = imapScript({ uids: [1, 2], sizes: { 1: 40 * 1024 * 1024 } });
    const server = await startServer({
      greeting: '* OK ready\r\n',
      onLine: script.onLine,
    });
    try {
      const result = await imapTransport(server.port).pullMessages({
        protocol: 'imap',
      });
      assert.equal(result.links.length, 1);
      assert.equal(result.skipped, 1);
      const bodies = script.calls.filter((c) => c.includes('BODY.PEEK'));
      assert.equal(bodies.length, 1);
      assert.ok(bodies[0].includes('FETCH 2 '));
    } finally {
      await server.close();
    }
  });

  it('logs in with XOAUTH2 when it has a token and no password', async () => {
    const script = imapScript({ uids: [1] });
    const server = await startServer({
      greeting: '* OK ready\r\n',
      onLine: script.onLine,
    });
    try {
      await createNodeEmailTransport({
        protocol: 'imap',
        host: '127.0.0.1',
        port: server.port,
        security: 'none',
        username: 'alice@example.com',
        token: 'ya29.token',
      }).pullMessages({ protocol: 'imap' });
      const line = script.calls.find((c) => c.includes('AUTHENTICATE XOAUTH2'));
      assert.ok(line);
      const decoded = Buffer.from(line.split(' ')[3], 'base64').toString();
      assert.equal(
        decoded,
        'user=alice@example.com\u0001auth=Bearer ya29.token\u0001\u0001'
      );
      assert.ok(!script.calls.some((c) => c.includes('LOGIN')));
    } finally {
      await server.close();
    }
  });
});

describe('IMAP security', () => {
  it('upgrades IMAP with STARTTLS before LOGIN', async () => {
    const calls = [];
    const server = await startServer({
      mode: 'starttls',
      greeting: '* OK ready\r\n',
      onLine: ({ line, socket, state }) => {
        calls.push(line);
        const tag = line.split(' ')[0];
        if (line.endsWith('STARTTLS')) {
          socket.write(`${tag} OK begin TLS\r\n`);
          state.upgrade();
        } else if (line.includes('LOGIN')) {
          socket.write(`${tag} OK done\r\n`);
        } else if (line.includes('SELECT')) {
          socket.write(`* OK [UIDVALIDITY 1] x\r\n${tag} OK done\r\n`);
        } else if (line.includes('UID SEARCH')) {
          socket.write(`* SEARCH\r\n${tag} OK done\r\n`);
        } else {
          socket.write(`${tag} OK done\r\n`);
        }
      },
    });
    try {
      await createNodeEmailTransport({
        protocol: 'imap',
        host: '127.0.0.1',
        port: server.port,
        security: 'starttls',
        ca: cert,
        username: 'alice',
        password: 'secret',
      }).pullMessages({ protocol: 'imap' });
      const start = calls.findIndex((c) => c.endsWith('STARTTLS'));
      const login = calls.findIndex((c) => c.includes('LOGIN'));
      assert.ok(start >= 0 && login > start);
    } finally {
      await server.close();
    }
  });
});

describe('IMAP mark read and delete', () => {
  const links = (uid) => ({
    links: [{ raw: { uid, mailbox: 'INBOX', uidValidity: 7 } }],
  });

  it('flags the message \\Seen by UID', async () => {
    const script = imapScript({ uids: [41, 42] });
    const server = await startServer({
      greeting: '* OK ready\r\n',
      onLine: script.onLine,
    });
    try {
      const result = await imapTransport(server.port).markRead(links(42), {
        protocol: 'imap',
      });
      assert.equal(result.read, 1);
      assert.ok(
        script.calls.some((c) =>
          c.endsWith('UID STORE 42 +FLAGS.SILENT (\\Seen)')
        )
      );
    } finally {
      await server.close();
    }
  });

  it('refuses UIDs of a renumbered mailbox', async () => {
    const script = imapScript({ uids: [42], validity: 8 });
    const server = await startServer({
      greeting: '* OK ready\r\n',
      onLine: script.onLine,
    });
    try {
      await assert.rejects(
        imapTransport(server.port).markRead(links(42), { protocol: 'imap' }),
        (error) => error.code === 'uidvalidity-changed'
      );
      assert.ok(!script.calls.some((c) => c.includes('STORE')));
    } finally {
      await server.close();
    }
  });

  it('moves a message to the folder the server calls Trash', async () => {
    const script = imapScript({ uids: [42], trash: true });
    const server = await startServer({
      greeting: '* OK ready\r\n',
      onLine: script.onLine,
    });
    try {
      const result = await imapTransport(server.port).deleteMessages(
        links(42),
        {
          protocol: 'imap',
        }
      );
      assert.equal(result.deleted, 1);
      assert.ok(
        script.calls.some((c) => c.endsWith('UID MOVE 42 "Deleted Items"'))
      );
    } finally {
      await server.close();
    }
  });

  it('does nothing destructive without a Trash folder', async () => {
    const script = imapScript({ uids: [42], trash: false });
    const server = await startServer({
      greeting: '* OK ready\r\n',
      onLine: script.onLine,
    });
    try {
      await assert.rejects(
        imapTransport(server.port).deleteMessages(links(42), {
          protocol: 'imap',
        }),
        (error) => error.code === 'no-trash-folder'
      );
      assert.ok(!script.calls.some((c) => /MOVE|STORE|EXPUNGE/.test(c)));
    } finally {
      await server.close();
    }
  });
});

describe('POP3 pulls are incremental by UIDL', () => {
  const popScript = (uidls) => {
    const calls = [];
    const onLine = ({ line, socket }) => {
      calls.push(line);
      if (line.startsWith('USER') || line.startsWith('PASS')) {
        socket.write('+OK\r\n');
      } else if (line === 'STAT') {
        socket.write(`+OK ${uidls.length} 100\r\n`);
      } else if (line === 'UIDL') {
        socket.write(
          `+OK\r\n${uidls.map((u, i) => `${i + 1} ${u}`).join('\r\n')}\r\n.\r\n`
        );
      } else if (line === 'LIST') {
        socket.write(
          `+OK\r\n${uidls.map((_, i) => `${i + 1} 100`).join('\r\n')}\r\n.\r\n`
        );
      } else if (line.startsWith('RETR')) {
        const n = line.split(' ')[1];
        socket.write(`+OK\r\n${MAIL.replace('m1@', `p${n}@`)}\r\n.\r\n`);
      } else if (line === 'QUIT') {
        socket.write('+OK bye\r\n');
        socket.end();
      }
    };
    return { onLine, calls };
  };

  it('reads only the messages it has not seen', async () => {
    const script = popScript(['u1', 'u2', 'u3']);
    const server = await startServer({
      greeting: '+OK ready\r\n',
      onLine: script.onLine,
    });
    try {
      const transport = createNodeEmailTransport({
        protocol: 'pop3',
        host: '127.0.0.1',
        port: server.port,
        security: 'none',
        username: 'alice',
        password: 'secret',
      });
      const result = await transport.pullMessages({
        protocol: 'pop3',
        since: { seen: ['u1', 'u2'] },
      });
      assert.deepEqual(
        script.calls.filter((c) => c.startsWith('RETR')),
        ['RETR 3']
      );
      assert.equal(result.links.length, 1);
      assert.deepEqual(result.state.seen, ['u1', 'u2', 'u3']);
    } finally {
      await server.close();
    }
  });
});
