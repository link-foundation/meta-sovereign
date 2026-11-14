import test from 'node:test';
import assert from 'node:assert/strict';
import { Api } from 'teleproto/tl/index.js';
import * as helpers from 'teleproto/Helpers.js';
import { telegramBacklinksFixture } from './helpers/telegram-backlinks.mjs';

test('real SDK request serialization accepts basic-group and channel posts, monitoring and local cleanup', async () => {
  for (const channel of [false, true]) {
    const f = await telegramBacklinksFixture();
    try {
      f.env.importer = async () => ({ Api, helpers });
      if (channel) {
        f.state.entity = {
          className: 'Channel',
          id: 7n,
          title: 'Supergroup',
          megagroup: true,
        };
      }
      // Real MemorySession.getInputEntity is synchronous, unlike client lookup.
      f.client.session.getInputEntity = () =>
        channel
          ? new Api.InputPeerChannel({
              channelId: helpers.returnBigInt(7),
              accessHash: helpers.returnBigInt(10),
            })
          : new Api.InputPeerChat({ chatId: helpers.returnBigInt(7) });
      const invoke = f.client.invoke;
      f.client.invoke = (request, ...args) => {
        assert.ok(
          request.getBytes().length > 4,
          `${request.className} serializes with its real schema`
        );
        if (request.className === 'channels.GetMessages') {
          assert.equal(request.channel.className, 'InputChannel');
        }
        return invoke(request, ...args);
      };
      const result = await f.post({
        chats: [channel ? '-1007' : '-7'],
        deleteIncoming: !channel,
      });
      assert.equal(result.status, 'confirmed');
      assert.equal(
        f.writes.filter((r) => r.className === 'messages.SendMessage').length,
        1
      );
      assert.equal(
        f.writes.filter((r) => r.className === 'messages.DeleteMessages')
          .length,
        channel ? 0 : 1
      );
    } finally {
      await f.close();
    }
  }
});
