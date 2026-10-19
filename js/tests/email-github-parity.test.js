/**
 * Field-parity tests for email.js and github.js — verifies new optional
 * fields (senderName, chatName, replyTo, raw, attachments, edited) and
 * new API methods (markRead, deleteMessages, editMessage, react).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseRfc822Message,
  normalizeEmailRecord,
  createEmailLive,
} from '../src/sources/email.js';
import {
  githubPayloadsToLinks,
  createGithubLive,
  GITHUB_EMOJI_TO_REACTION,
} from '../src/sources/github.js';

/** Minimal fake fetch that records calls and returns a JSON response. */
const makeFetch = (responseData = {}) => {
  const calls = [];
  const fn = async (url, init = {}) => {
    calls.push({ url: url.toString(), init });
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => JSON.stringify(responseData),
    };
  };
  fn.calls = calls;
  return fn;
};

// ---------------------------------------------------------------------------
// parseRfc822Message
// ---------------------------------------------------------------------------

describe('parseRfc822Message', () => {
  it('produces senderName from From display name', () => {
    const raw =
      'From: Alice Smith <alice@example.com>\r\n' +
      'To: bob@example.com\r\n' +
      'Subject: Hello\r\n' +
      'Message-ID: <abc123@example.com>\r\n' +
      'Date: Mon, 1 Jan 2024 00:00:00 +0000\r\n' +
      '\r\n' +
      'Body text';
    const link = parseRfc822Message(raw);
    assert.equal(link.senderName, 'Alice Smith');
  });

  it('produces chatName from subject', () => {
    const raw =
      'From: alice@example.com\r\n' +
      'To: bob@example.com\r\n' +
      'Subject: My Subject\r\n' +
      'Message-ID: <abc124@example.com>\r\n' +
      '\r\n' +
      'Body';
    const link = parseRfc822Message(raw);
    assert.equal(link.chatName, 'My Subject');
  });

  it('produces replyTo from In-Reply-To header', () => {
    const raw =
      'From: alice@example.com\r\n' +
      'To: bob@example.com\r\n' +
      'Subject: Re: Test\r\n' +
      'Message-ID: <reply@example.com>\r\n' +
      'In-Reply-To: <orig@example.com>\r\n' +
      '\r\n' +
      'Replying';
    const link = parseRfc822Message(raw);
    assert.equal(link.replyTo, 'orig@example.com');
  });

  it('produces non-null raw with messageId field', () => {
    const raw =
      'From: alice@example.com\r\n' +
      'To: bob@example.com\r\n' +
      'Subject: Test\r\n' +
      'Message-ID: <rawtest@example.com>\r\n' +
      '\r\n' +
      'Text';
    const link = parseRfc822Message(raw);
    assert.ok(link.raw !== null && link.raw !== undefined);
    assert.equal(link.raw.messageId, 'rawtest@example.com');
  });
});

// ---------------------------------------------------------------------------
// normalizeEmailRecord — Gmail shape
// ---------------------------------------------------------------------------

describe('normalizeEmailRecord (Gmail)', () => {
  it('produces non-null raw with id and threadId', () => {
    const message = {
      id: 'msg001',
      threadId: 'thread001',
      labelIds: ['INBOX'],
      payload: {
        headers: [
          { name: 'From', value: 'Alice <alice@example.com>' },
          { name: 'To', value: 'bob@example.com' },
          { name: 'Subject', value: 'Hi' },
        ],
        mimeType: 'text/plain',
        body: { data: '' },
      },
    };
    const link = normalizeEmailRecord(message);
    assert.ok(link.raw !== null && link.raw !== undefined);
    assert.equal(link.raw.id, 'msg001');
    assert.equal(link.raw.threadId, 'thread001');
  });

  it('produces attachments from payload parts with filename', () => {
    const message = {
      id: 'msg002',
      threadId: 'thread002',
      payload: {
        headers: [{ name: 'From', value: 'alice@example.com' }],
        parts: [
          {
            filename: 'report.pdf',
            mimeType: 'application/pdf',
            body: { size: 1024 },
          },
          {
            filename: 'image.png',
            mimeType: 'image/png',
            body: { size: 512 },
          },
        ],
      },
    };
    const link = normalizeEmailRecord(message);
    assert.ok(Array.isArray(link.attachments));
    assert.equal(link.attachments.length, 2);
    assert.equal(link.attachments[0].kind, 'file');
    assert.equal(link.attachments[0].name, 'report.pdf');
    assert.equal(link.attachments[0].mime, 'application/pdf');
    assert.equal(link.attachments[0].size, 1024);
  });
});

// ---------------------------------------------------------------------------
// normalizeEmailRecord — JMAP shape
// ---------------------------------------------------------------------------

describe('normalizeEmailRecord (JMAP)', () => {
  it('produces senderName from JMAP from field', () => {
    const message = {
      id: 'jmap001',
      threadId: 'jmapThread001',
      from: [{ name: 'Bob Sender', email: 'bob@example.com' }],
      to: [{ email: 'carol@example.com' }],
      subject: 'JMAP Test',
      receivedAt: '2024-01-01T00:00:00Z',
    };
    const link = normalizeEmailRecord(message);
    assert.equal(link.senderName, 'Bob Sender');
  });
});

// ---------------------------------------------------------------------------
// GitHub link builders
// ---------------------------------------------------------------------------

describe('githubPayloadsToLinks — issueToLink', () => {
  it('produces non-null raw with id field', () => {
    const payload = {
      id: 42,
      number: 7,
      title: 'Bug report',
      body: 'Details',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
      html_url: 'https://github.com/owner/repo/issues/7',
      url: 'https://api.github.com/repos/owner/repo/issues/7',
      user: { login: 'alice', name: 'Alice' },
    };
    const [link] = githubPayloadsToLinks([payload]);
    assert.ok(link.raw !== null && link.raw !== undefined);
    assert.equal(link.raw.id, 42);
  });
});

describe('githubPayloadsToLinks — issueCommentToLink', () => {
  it('produces edited when updated_at !== created_at', () => {
    const payload = {
      id: 100,
      body: 'A comment',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-02T00:00:00Z',
      issue_url: 'https://api.github.com/repos/owner/repo/issues/7',
      html_url: 'https://github.com/owner/repo/issues/7#issuecomment-100',
      user: { login: 'bob' },
    };
    const [link] = githubPayloadsToLinks([payload]);
    assert.equal(link.edited, '2024-01-02T00:00:00Z');
  });
});

describe('githubPayloadsToLinks — reviewCommentToLink', () => {
  it('produces replyTo from in_reply_to_id', () => {
    const payload = {
      id: 200,
      body: 'Review comment',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
      pull_request_review_id: 999,
      diff_hunk: '@@ -1,3 +1,4 @@',
      in_reply_to_id: 150,
      url: 'https://api.github.com/repos/owner/repo/pulls/comments/200',
      user: { login: 'carol' },
    };
    const [link] = githubPayloadsToLinks([payload]);
    assert.equal(link.replyTo, '150');
  });
});

// ---------------------------------------------------------------------------
// createGithubLive — API methods
// ---------------------------------------------------------------------------

describe('createGithubLive — editMessage', () => {
  it('calls PATCH on the comments endpoint', async () => {
    const fetch = makeFetch({ id: 99 });
    const live = createGithubLive({
      token: 'tok',
      owner: 'owner',
      repo: 'repo',
      fetchImpl: fetch,
      baseUrl: 'https://api.github.com',
    });
    await live.editMessage({ id: '42', text: 'updated body' });
    assert.equal(fetch.calls.length, 1);
    const call = fetch.calls[0];
    assert.ok(call.url.includes('/issues/comments/42'));
    assert.equal(call.init.method, 'PATCH');
  });
});

describe('createGithubLive — deleteMessages', () => {
  it('calls DELETE on the comments endpoint for each id', async () => {
    const fetch = makeFetch(null);
    const live = createGithubLive({
      token: 'tok',
      owner: 'owner',
      repo: 'repo',
      fetchImpl: fetch,
      baseUrl: 'https://api.github.com',
    });
    const result = await live.deleteMessages({ ids: ['10', '20'] });
    assert.equal(fetch.calls.length, 2);
    assert.ok(fetch.calls[0].url.includes('/issues/comments/10'));
    assert.equal(fetch.calls[0].init.method, 'DELETE');
    assert.ok(fetch.calls[1].url.includes('/issues/comments/20'));
    assert.equal(result.deleted, 2);
  });
});

describe('createGithubLive — react', () => {
  it('sends POST with content +1 for thumbs-up emoji', async () => {
    const fetch = makeFetch({ id: 1 });
    const live = createGithubLive({
      token: 'tok',
      owner: 'owner',
      repo: 'repo',
      fetchImpl: fetch,
      baseUrl: 'https://api.github.com',
    });
    await live.react({ id: '42', emoji: '👍' });
    assert.equal(fetch.calls.length, 1);
    const body = JSON.parse(fetch.calls[0].init.body);
    assert.equal(body.content, '+1');
    assert.ok(fetch.calls[0].url.includes('/reactions'));
  });

  it('throws for unsupported emoji', async () => {
    const fetch = makeFetch({});
    const live = createGithubLive({
      token: 'tok',
      owner: 'owner',
      repo: 'repo',
      fetchImpl: fetch,
      baseUrl: 'https://api.github.com',
    });
    await assert.rejects(
      () => live.react({ id: '42', emoji: '🦄' }),
      /unsupported reaction emoji/
    );
  });
});

// ---------------------------------------------------------------------------
// createEmailLive — markRead / deleteMessages
// ---------------------------------------------------------------------------

describe('createEmailLive — markRead (Gmail)', () => {
  it('sends POST to /modify with removeLabelIds UNREAD', async () => {
    const fetch = makeFetch({ id: 'msg1', labelIds: [] });
    const live = createEmailLive({
      protocol: 'gmail',
      token: 'test-token',
      fetchImpl: fetch,
      baseUrl: 'https://gmail.googleapis.com',
    });
    await live.markRead({ id: 'msg1' });
    assert.equal(fetch.calls.length, 1);
    const call = fetch.calls[0];
    assert.ok(call.url.includes('/messages/msg1/modify'));
    assert.equal(call.init.method, 'POST');
    const body = JSON.parse(call.init.body);
    assert.deepEqual(body.removeLabelIds, ['UNREAD']);
  });
});

describe('createEmailLive — deleteMessages (Gmail)', () => {
  it('sends POST to /trash for each message id', async () => {
    const fetch = makeFetch({ id: 'msg2' });
    const live = createEmailLive({
      protocol: 'gmail',
      token: 'test-token',
      fetchImpl: fetch,
      baseUrl: 'https://gmail.googleapis.com',
    });
    const result = await live.deleteMessages({ ids: ['msg2', 'msg3'] });
    assert.equal(fetch.calls.length, 2);
    assert.ok(fetch.calls[0].url.includes('/messages/msg2/trash'));
    assert.equal(fetch.calls[0].init.method, 'POST');
    assert.ok(fetch.calls[1].url.includes('/messages/msg3/trash'));
    assert.equal(result.deleted, 2);
  });
});

describe('createEmailLive — markRead (Graph)', () => {
  it('sends PATCH to /me/messages/{id} with isRead true', async () => {
    const fetch = makeFetch({ id: 'graphmsg1' });
    const live = createEmailLive({
      protocol: 'microsoft-graph',
      token: 'test-token',
      fetchImpl: fetch,
      baseUrl: 'https://graph.microsoft.com/v1.0',
    });
    await live.markRead({ id: 'graphmsg1' });
    assert.equal(fetch.calls.length, 1);
    const call = fetch.calls[0];
    assert.ok(call.url.includes('/me/messages/graphmsg1'));
    assert.equal(call.init.method, 'PATCH');
    const body = JSON.parse(call.init.body);
    assert.equal(body.isRead, true);
  });
});

describe('createEmailLive — deleteMessages (Graph)', () => {
  it('sends POST to /move with destinationId deleteditems', async () => {
    const fetch = makeFetch({ id: 'graphmsg2' });
    const live = createEmailLive({
      protocol: 'microsoft-graph',
      token: 'test-token',
      fetchImpl: fetch,
      baseUrl: 'https://graph.microsoft.com/v1.0',
    });
    await live.deleteMessages({ ids: ['graphmsg2'] });
    assert.equal(fetch.calls.length, 1);
    const call = fetch.calls[0];
    assert.ok(call.url.includes('/me/messages/graphmsg2/move'));
    assert.equal(call.init.method, 'POST');
    const body = JSON.parse(call.init.body);
    assert.equal(body.destinationId, 'deleteditems');
  });
});

// Verify GITHUB_EMOJI_TO_REACTION is exported with expected entries
describe('GITHUB_EMOJI_TO_REACTION', () => {
  it('maps thumbs-up to +1', () => {
    assert.equal(GITHUB_EMOJI_TO_REACTION['👍'], '+1');
  });
});
