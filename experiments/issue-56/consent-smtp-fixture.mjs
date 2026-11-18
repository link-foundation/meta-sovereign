import net from 'node:net';
import { createEmailLive } from '../../js/src/sources/email-live.js';
import { createNodeEmailTransport } from '../../js/src/sources/email-node-transport.js';
import { fixtureServerClose } from '../../js/tests/helpers/fixture-server.mjs';

/** One owned loopback SMTP session, with no credentials or external access. */
export const smtpConsentFixture = async (variant, wait, effects) => {
  const server = net.createServer((socket) => {
    socket.setEncoding('utf8');
    let buffer = '';
    let inData = false;
    let bodySeen = false;
    let chain = Promise.resolve();
    const answer = async (line) => {
      if (inData) {
        if (!bodySeen && line !== '.') {
          bodySeen = true;
          effects.push('api');
        }
        if (line === '.') {
          inData = false;
          await wait('issued');
          socket.write('250 queued\r\n');
        }
        return;
      }
      if (line.startsWith('EHLO ')) {
        if (variant === 'email-smtp-greeting') {
          await wait('prepare');
        }
        socket.write('250 localhost\r\n');
      } else if (line.startsWith('MAIL FROM:')) {
        socket.write('250 sender\r\n');
      } else if (line.startsWith('RCPT TO:')) {
        if (variant === 'email-smtp-recipient') {
          await wait('prepare');
        }
        socket.write('250 recipient\r\n');
      } else if (line === 'DATA') {
        if (variant === 'email-smtp-data') {
          await wait('prepare');
        }
        inData = true;
        socket.write('354 body\r\n');
      } else if (line === 'QUIT') {
        socket.end('221 bye\r\n');
      }
    };
    socket.on('data', (chunk) => {
      buffer += chunk;
      let newline;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline).replace(/\r$/, '');
        buffer = buffer.slice(newline + 1);
        chain = chain.then(() => answer(line));
        chain.catch(() => socket.destroy());
      }
    });
    socket.write('220 fixture\r\n');
  });
  const close = fixtureServerClose(server, 'consent-smtp');
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const config = {
    protocol: 'smtp',
    host: '127.0.0.1',
    port: server.address().port,
    security: 'none',
    username: 'a@example.test',
  };
  return {
    live: createEmailLive({
      ...config,
      transport: createNodeEmailTransport(config),
    }),
    options: {
      lookup: {
        thread: async () => ({
          from: 'a@example.test',
          to: ['b@example.test'],
        }),
      },
    },
    close,
  };
};
