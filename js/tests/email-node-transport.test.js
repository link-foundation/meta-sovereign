import { Buffer } from 'node:buffer';
import net from 'node:net';
import { describe, it, expect } from 'test-anywhere';

import { createNodeEmailTransport } from '../src/sources/email-node-transport.js';

const sampleMessage = [
  'Message-ID: <raw-1@example.com>',
  'From: Alice <alice@example.com>',
  'To: Bob <bob@example.com>',
  'Subject: Raw mail hello',
  'Date: Sun, 03 May 2026 10:00:00 +0000',
  '',
  'Hello from raw mail',
].join('\r\n');

const closeServer = (server) =>
  new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });

const startLineServer = async (onLine) => {
  const server = net.createServer((socket) => {
    socket.setEncoding('utf8');
    let buffer = '';
    socket.on('data', (chunk) => {
      buffer += chunk;
      for (;;) {
        const idx = buffer.indexOf('\n');
        if (idx < 0) {
          break;
        }
        const line = buffer.slice(0, idx).replace(/\r$/, '');
        buffer = buffer.slice(idx + 1);
        onLine({ line, socket });
      }
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, port: server.address().port };
};

describe('Node email raw protocol transport', () => {
  it('pulls POP3 messages through the local server transport', async () => {
    const { server, port } = await startLineServer(({ line, socket }) => {
      if (line === 'USER alice' || line === 'PASS secret') {
        socket.write('+OK\r\n');
      } else if (line === 'STAT') {
        socket.write('+OK 1 100\r\n');
      } else if (line === 'RETR 1') {
        socket.write(`+OK\r\n${sampleMessage}\r\n.\r\n`);
      } else if (line === 'QUIT') {
        socket.write('+OK bye\r\n');
        socket.end();
      }
    });
    try {
      server.on('connection', (socket) => socket.write('+OK POP3 ready\r\n'));
      const transport = createNodeEmailTransport({
        protocol: 'pop3',
        host: '127.0.0.1',
        port,
        secure: false,
        username: 'alice',
        password: 'secret',
      });
      const result = await transport.pullMessages({
        protocol: 'pop3',
        limit: 1,
      });
      expect(result.links[0].id).toBe('msg:email:raw-1@example.com');
      expect(result.links[0].body).toBe('Hello from raw mail');
    } finally {
      await closeServer(server);
    }
  });

  it('pulls IMAP messages through the local server transport', async () => {
    const literalSize = Buffer.byteLength(sampleMessage);
    const { server, port } = await startLineServer(({ line, socket }) => {
      const tag = line.split(' ')[0];
      if (line.includes(' LOGIN ')) {
        socket.write(`${tag} OK LOGIN done\r\n`);
      } else if (line.includes(' SELECT ')) {
        socket.write(`* 1 EXISTS\r\n${tag} OK SELECT done\r\n`);
      } else if (line.includes('UID SEARCH ALL')) {
        socket.write(`* SEARCH 42\r\n${tag} OK SEARCH done\r\n`);
      } else if (line.includes('UID FETCH 42')) {
        socket.write(
          `* 1 FETCH (UID 42 BODY[] {${literalSize}}\r\n${sampleMessage}\r\n)\r\n${tag} OK FETCH done\r\n`
        );
      } else if (line.includes('LOGOUT')) {
        socket.write(`* BYE\r\n${tag} OK LOGOUT done\r\n`);
        socket.end();
      }
    });
    try {
      server.on('connection', (socket) => socket.write('* OK IMAP ready\r\n'));
      const transport = createNodeEmailTransport({
        protocol: 'imap',
        host: '127.0.0.1',
        port,
        secure: false,
        username: 'alice',
        password: 'secret',
      });
      const result = await transport.pullMessages({
        protocol: 'imap',
        limit: 1,
      });
      expect(result.links[0].id).toBe('msg:email:raw-1@example.com');
      expect(result.rawCount).toBe(1);
    } finally {
      await closeServer(server);
    }
  });

  it('sends SMTP messages through the local server transport', async () => {
    const commands = [];
    let inData = false;
    let data = '';
    const { server, port } = await startLineServer(({ line, socket }) => {
      if (inData) {
        if (line === '.') {
          inData = false;
          socket.write('250 queued\r\n');
        } else {
          data += `${line}\n`;
        }
        return;
      }
      commands.push(line);
      if (line.startsWith('EHLO')) {
        socket.write('250-localhost\r\n250 AUTH LOGIN\r\n');
      } else if (line === 'AUTH LOGIN') {
        socket.write('334 VXNlcm5hbWU6\r\n');
      } else if (line === Buffer.from('alice').toString('base64')) {
        socket.write('334 UGFzc3dvcmQ6\r\n');
      } else if (line === Buffer.from('secret').toString('base64')) {
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
    });
    try {
      server.on('connection', (socket) => socket.write('220 SMTP ready\r\n'));
      const transport = createNodeEmailTransport({
        protocol: 'smtp',
        host: '127.0.0.1',
        port,
        secure: false,
        username: 'alice',
        password: 'secret',
      });
      const result = await transport.post(
        {
          from: 'alice@example.com',
          to: 'bob@example.com',
          subject: 'SMTP hello',
          text: 'Hello through SMTP',
        },
        { protocol: 'smtp' }
      );
      expect(result.accepted).toEqual(['bob@example.com']);
      expect(commands).toContain('MAIL FROM:<alice@example.com>');
      expect(commands).toContain('RCPT TO:<bob@example.com>');
      expect(data).toContain('Subject: SMTP hello');
      expect(data).toContain('Hello through SMTP');
    } finally {
      await closeServer(server);
    }
  });
});
