import { test } from 'node:test';
import assert from 'node:assert/strict';
import { importTelegram } from '../src/sources/telegram-layer.js';
import { telegramDialogLinks } from '../src/sources/telegram-account.js';
import { rawMessage } from '../src/sources/telegram-history.js';
import { downloadBytes, downloadSize } from '../src/sources/telegram-media.js';
import { parseMedia } from '../src/web/message-parts.js';
import { transferAttachments } from '../src/web/attachment-transfer.js';

test('real Telegram prototype type tags survive sending, serialization and photo display', async () => {
  const { Api } = await importTelegram();
  const photo = new Api.Photo({
    id: 1n,
    accessHash: 2n,
    fileReference: Buffer.from([1]),
    date: 10,
    sizes: [new Api.PhotoSize({ type: 'm', w: 120, h: 80, size: 1234 })],
    dcId: 1,
  });
  const message = new Api.Message({
    id: 7,
    out: true,
    peerId: new Api.PeerUser({ userId: 42n }),
    date: 10,
    message: '',
    media: new Api.MessageMediaPhoto({ photo }),
  });
  assert.equal(
    Object.hasOwn(message.media, 'className'),
    false,
    'matches the installed client'
  );
  const raw = rawMessage(message);
  assert.equal(raw.className, 'Message');
  assert.equal(raw.media.className, 'MessageMediaPhoto');
  assert.equal(raw.media.photo.sizes[0].className, 'PhotoSize');
  const [link] = telegramDialogLinks({ id: '42', isUser: true }, [message]);
  assert.equal(parseMedia(link.raw).kind, 'photo');
  const bytes = downloadBytes(link.raw.media.photo, 'm');
  assert.equal(bytes, 1234);
  assert.deepEqual(downloadSize({ returnBigInt: BigInt }, bytes), {
    fileSize: 1234n,
  });
  assert.deepEqual(
    downloadSize({ returnBigInt: BigInt }, downloadBytes(photo, 'unknown')),
    {},
    'an unknown size is not an invented exact limit'
  );
});

test('attachment progress measures the local and provider stages and stops after confirmation', async () => {
  const reported = [];
  let polls = 0;
  const answer = await transferAttachments(
    {
      telegramUpload: async (_file, { onProgress }) => {
        onProgress(0.5);
        onProgress(1);
        return { token: 'token' };
      },
      telegramUploadProgress: async () => {
        polls += 1;
        return { ok: true, progress: 0.4 };
      },
      telegramSendFiles: async (body) => {
        assert.deepEqual(body.tokens, ['token']);
        await new Promise((resolve) => globalThis.setTimeout(resolve, 10));
        return { ok: true, ids: [7] };
      },
    },
    [{ file: { size: 20 } }],
    { chat: '42', caption: 'fixture' },
    (progress) => reported.push(progress)
  );
  assert.equal(answer.ok, true);
  assert.deepEqual(
    reported.map((p) => [p.stage, p.value]),
    [
      ['uploading', 0.5],
      ['uploading', 1],
      ['sending', 0],
      ['sending', 0.4],
    ]
  );
  assert.equal(polls, 1);
  assert.equal(
    reported.some((p) => p.stage === 'sending' && p.value === 1),
    false
  );
});

test('a failed upload never sends; a thrown send does not leave a progress poll running', async () => {
  let sent = false;
  const failed = await transferAttachments(
    {
      telegramUpload: async () => ({ error: 'no server' }),
      telegramSendFiles: async () => {
        sent = true;
      },
    },
    [{ file: { size: 1 } }],
    {},
    () => {}
  );
  assert.equal(failed.error, 'no server');
  assert.equal(sent, false);
  await assert.rejects(
    transferAttachments(
      {
        telegramUpload: async () => ({ token: 't' }),
        telegramSendFiles: async () => {
          throw new Error('refused');
        },
      },
      [{ file: { size: 1 } }],
      {},
      () => {}
    ),
    /refused/
  );
});
