import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  continuationFixture,
  ownMessage,
  PRIVATE,
  PUBLIC,
} from './helpers/telegram-continuation.mjs';

const draft = {
  chat: PUBLIC,
  clientId: 'follow-up',
  continueLast: true,
  text: 'Next',
};

test('continues the same message and preserves entities, edit history metadata and the submitted draft state', async () => {
  const f = await continuationFixture();
  const { continueMessage } = f.actions();
  const text = '🌱 First';
  const bold = new f.Api.MessageEntityBold({ offset: 3, length: 5 });
  const link = await f.note(
    PUBLIC,
    ownMessage(PUBLIC, 5, text, { entities: [bold] })
  );
  await f.store.put({ id: `read:telegram:${PUBLIC}`, draft: '**Next**' });

  const sent = await continueMessage({ ...draft, text: '**Next**' });
  assert.equal(sent.edited, true);
  assert.equal(sent.link.id, link.id);
  assert.equal(sent.link.timestamp, link.timestamp);
  assert.equal(sent.link.body, `${text}\n\nNext`);
  assert.ok(sent.link.edited);
  assert.equal(f.edits.length, 1);
  assert.equal(f.edits[0].entities[0], bold);
  assert.equal(f.edits[0].entities[1].offset, text.length + 2);
  assert.equal(f.edits[0].entities[1].length, 4);
  assert.equal(f.calls.at(-1).className, 'messages.SaveDraft');
  assert.equal((await f.store.get(`read:telegram:${PUBLIC}`)).draft, '');

  const retry = await f
    .actions()
    .continueMessage({ ...draft, text: '**Next**' });
  assert.equal(retry.link.body, sent.link.body);
  assert.equal(f.edits.length, 1);
  assert.equal(
    f.calls.filter((call) => call.className === 'messages.SaveDraft').length,
    1
  );
});

test('only an ordinary send can continue the newest outgoing plain text', async (t) => {
  for (const [label, chat, extra, request, limit] of [
    ['off', PUBLIC, {}, { continueLast: false }],
    ['without a stable request id', PUBLIC, {}, { clientId: null }],
    ['private group', PRIVATE, {}, {}],
    [
      'incoming message absent from the local store',
      PUBLIC,
      { out: false },
      {},
    ],
    ['different sender identity', PUBLIC, { fromId: { userId: 99 } }, {}],
    ['forwarded text', PUBLIC, { fwdFrom: {} }, {}],
    ['bot-generated text', PUBLIC, { viaBotId: 99 }, {}],
    [
      'media caption',
      PUBLIC,
      { media: { className: 'MessageMediaPhoto' } },
      {},
    ],
    ['latest reply', PUBLIC, { replyTo: { replyToMsgId: 2 } }, {}],
    ['service event', PUBLIC, { className: 'MessageService' }, {}],
    ['reply send', PUBLIC, {}, { replyTo: 4 }],
    ['scheduled send', PUBLIC, {}, { scheduleDate: 1799000000 }],
    ['silent send', PUBLIC, {}, { silent: true }],
    ['paid send', PUBLIC, {}, { allowPaidStars: 1 }],
    ['send as another identity', PUBLIC, {}, { sendAs: '-100740' }],
    ['explicit preview', PUBLIC, {}, { previewUrl: 'https://example.com' }],
    ['command', PUBLIC, {}, { text: '/start' }],
    ['message limit', PUBLIC, {}, {}, 8],
  ]) {
    await t.test(label, async () => {
      const f = await continuationFixture();
      f.state.limit = limit ?? f.state.limit;
      await f.note(chat, ownMessage(chat, 4, 'First'));
      await f.note(chat, ownMessage(chat, 5, 'Latest', extra), {
        cached: false,
      });
      assert.equal(
        await f.actions().continueMessage({ ...draft, chat, ...request }),
        null
      );
      assert.equal(f.edits.length, 0);
    });
  }
});

test('reads the selected public forum topic and accepts a broadcast channel author', async () => {
  const f = await continuationFixture();
  f.state.channel = {
    forum: true,
    username: null,
    usernames: [{ active: true }],
  };
  const topic = 10;
  const last = ownMessage(PUBLIC, 11, 'In the topic', {
    replyTo: { forumTopic: true, replyToMsgId: topic },
  });
  const other = ownMessage(PUBLIC, 12, 'Latest in the group', { out: false });
  await f.note(PUBLIC, last);
  await f.note(PUBLIC, other);
  f.state.forum = {
    topics: [
      { id: topic, topMessage: 11 },
      { id: 1, topMessage: 12 },
    ],
    messages: [other, last],
  };
  const continueMessage = f.actions().continueMessage;
  assert.equal(
    (await continueMessage({ ...draft, topic })).link.body,
    'In the topic\n\nNext'
  );
  assert.equal(await continueMessage({ ...draft, clientId: 'general' }), null);
  assert.equal(f.edits[0].id, 11);
  assert.equal(
    f.calls.some(({ className }) => className === 'messages.GetHistory'),
    false
  );

  f.state.channel = { broadcast: true, megagroup: false };
  await f.note(
    PUBLIC,
    ownMessage(PUBLIC, 13, 'Channel post', { fromId: undefined, post: true })
  );
  assert.equal(
    (await continueMessage({ ...draft, clientId: 'channel' })).link.body,
    'Channel post\n\nNext'
  );
  assert.equal(f.edits.at(-1).id, 13);
});

test('keeps the provider default send-as identity and skips bot sessions', async () => {
  const f = await continuationFixture();
  f.state.fullChat = { defaultSendAs: { channelId: 740 } };
  await f.note(
    PUBLIC,
    ownMessage(PUBLIC, 5, 'First', { fromId: { channelId: 740 } })
  );
  f.state.kind = 'bot';
  assert.equal(await f.actions().continueMessage(draft), null);
  assert.equal(f.calls.length, 0);
  f.state.kind = 'user';
  const sent = await f
    .actions()
    .continueMessage({ ...draft, sendAs: '-100740' });
  assert.equal(sent.link.body, 'First\n\nNext');
});

test('preserves separate sends for definite edit refusals and stops on ambiguous outcomes', async () => {
  const f = await continuationFixture();
  await f.note(PUBLIC, ownMessage(PUBLIC, 5, 'First'));
  f.state.onEdit = () => {
    throw Object.assign(new Error('expired'), {
      errorMessage: 'MESSAGE_EDIT_TIME_EXPIRED',
    });
  };
  assert.equal(await f.actions().continueMessage(draft), null);
  assert.equal(await f.actions().continueMessage(draft), null);
  assert.equal(f.edits.length, 1);

  const next = { ...draft, clientId: 'transport-lost' };
  f.state.onEdit = () => {
    throw new Error('lost transport');
  };
  await assert.rejects(f.actions().continueMessage(next), {
    code: 'send-unknown',
  });
  f.state.onEdit = null;
  await assert.rejects(f.actions().continueMessage(next), {
    code: 'send-unknown',
  });
  assert.equal(f.edits.length, 2);
});

test('accepts an edit Telegram already has without posting or editing again', async () => {
  const f = await continuationFixture();
  await f.note(PUBLIC, ownMessage(PUBLIC, 5, 'First'));
  f.state.onEdit = () => {
    throw Object.assign(new Error('unchanged'), {
      errorMessage: 'MESSAGE_NOT_MODIFIED',
    });
  };
  assert.deepEqual(await f.actions().continueMessage(draft), {
    edited: true,
    link: null,
  });
  assert.deepEqual(await f.actions().continueMessage(draft), {
    edited: true,
    link: null,
  });
  assert.equal(f.edits.length, 1);
});

test('keeps provider flood waits retryable and leaves a newer cloud draft alone', async () => {
  const f = await continuationFixture();
  const readId = `read:telegram:${PUBLIC}`;
  await f.note(PUBLIC, ownMessage(PUBLIC, 5, 'First'));
  await f.store.put({ id: readId, draft: 'Next', draftAt: 'before' });
  f.state.onEdit = () => {
    throw Object.assign(new Error('FLOOD_WAIT_3'), { seconds: 3 });
  };
  await assert.rejects(f.actions().continueMessage(draft), {
    code: 'flood-wait',
    retryAfter: 3,
  });
  f.state.onEdit = () =>
    f.store.put({ id: readId, draft: 'New unsent text', draftAt: 'after' });
  assert.equal(
    (await f.actions().continueMessage(draft)).link.body,
    'First\n\nNext'
  );
  assert.equal((await f.store.get(readId)).draft, 'New unsent text');
  assert.equal(
    f.calls.some(({ className }) => className === 'messages.SaveDraft'),
    false
  );
});
