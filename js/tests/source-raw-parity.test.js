/**
 * Tests that upwork, peopleperhour and linkedin message-to-link
 * conversions populate the new optional fields: raw, chatName,
 * senderName, edited.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { upworkPayloadsToLinks, upworkSource } from '../src/sources/upwork.js';
import {
  peoplePerHourPayloadsToLinks,
  peoplePerHourSource,
} from '../src/sources/peopleperhour.js';
import {
  linkedinPostsToLinks,
  linkedinSource,
} from '../src/sources/linkedin.js';

// ---------------------------------------------------------------------------
// Upwork
// ---------------------------------------------------------------------------

describe('upwork messageToLink', () => {
  const baseMsg = {
    id: 'msg-1',
    text: 'Hello',
    roomId: 'room-1',
    author: { id: 'u1', name: 'Alice', displayName: 'Alice Smith' },
    createdAt: '2024-01-01T10:00:00Z',
    updatedAt: '2024-01-01T11:00:00Z',
    room: { id: 'room-1', topic: 'Design Brief', name: 'Design Room' },
  };

  test('produces non-null raw with id field', () => {
    const [link] = upworkPayloadsToLinks([baseMsg]);
    assert.ok(link.raw !== null && link.raw !== undefined, 'raw should be set');
    assert.equal(link.raw.id, 'msg-1');
  });

  test('produces senderName when author.name present', () => {
    const [link] = upworkPayloadsToLinks([baseMsg]);
    assert.equal(link.senderName, 'Alice');
  });

  test('produces edited when updatedAt differs from createdAt', () => {
    const [link] = upworkPayloadsToLinks([baseMsg]);
    assert.equal(link.edited, '2024-01-01T11:00:00Z');
  });

  test('does not set edited when updatedAt equals createdAt', () => {
    const msg = { ...baseMsg, updatedAt: baseMsg.createdAt };
    const [link] = upworkPayloadsToLinks([msg]);
    assert.equal(link.edited ?? null, null);
  });
});

describe('upwork parseArchive array of messages', () => {
  const msgs = [
    {
      id: 'a1',
      text: 'msg a',
      roomId: 'r1',
      author: { id: 'u1' },
      createdAt: '2024-02-01',
    },
    {
      id: 'a2',
      text: 'msg b',
      roomId: 'r1',
      author: { id: 'u2' },
      createdAt: '2024-02-02',
    },
  ];

  test('all links have raw', async () => {
    const links = await upworkSource.parseArchive(msgs);
    const msgLinks = links.filter((l) => l.id.startsWith('msg:'));
    assert.ok(msgLinks.length > 0, 'expected at least one message link');
    for (const link of msgLinks) {
      assert.ok(
        link.raw !== null && link.raw !== undefined,
        `raw missing on ${link.id}`
      );
    }
  });
});

// ---------------------------------------------------------------------------
// PeoplePerHour
// ---------------------------------------------------------------------------

describe('peopleperhour messageToLink', () => {
  const baseMsg = {
    id: 'pph-msg-1',
    text: 'Hi there',
    workstreamId: 'ws-1',
    proposalId: 'prop-1',
    author: { id: 'u2', name: 'Bob', displayName: 'Bob Builder' },
    createdAt: '2024-03-01T08:00:00Z',
    updatedAt: '2024-03-01T09:00:00Z',
    workstream: { id: 'ws-1', topic: 'Website Redesign', name: 'WS Room' },
  };

  test('produces non-null raw', () => {
    const [link] = peoplePerHourPayloadsToLinks([baseMsg]);
    assert.ok(link.raw !== null && link.raw !== undefined, 'raw should be set');
    assert.equal(link.raw.id, 'pph-msg-1');
    assert.equal(link.raw.workstreamId, 'ws-1');
    assert.equal(link.raw.proposalId, 'prop-1');
  });

  test('produces chatName from workstream topic', () => {
    const [link] = peoplePerHourPayloadsToLinks([baseMsg]);
    assert.equal(link.chatName, 'Website Redesign');
  });

  test('falls back to workstream.name when topic absent', () => {
    const msg = {
      ...baseMsg,
      workstream: { id: 'ws-1', name: 'WS Room' },
    };
    const [link] = peoplePerHourPayloadsToLinks([msg]);
    assert.equal(link.chatName, 'WS Room');
  });
});

describe('peopleperhour parseArchive array of messages', () => {
  const msgs = [
    {
      id: 'p1',
      text: 'msg p1',
      workstreamId: 'ws2',
      author: { id: 'u3' },
      createdAt: '2024-04-01',
    },
    {
      id: 'p2',
      text: 'msg p2',
      workstreamId: 'ws2',
      author: { id: 'u4' },
      createdAt: '2024-04-02',
    },
  ];

  test('all message links have raw', async () => {
    const links = await peoplePerHourSource.parseArchive(msgs);
    const msgLinks = links.filter((l) => l.id.startsWith('msg:'));
    assert.ok(msgLinks.length > 0, 'expected at least one message link');
    for (const link of msgLinks) {
      assert.ok(
        link.raw !== null && link.raw !== undefined,
        `raw missing on ${link.id}`
      );
    }
  });
});

// ---------------------------------------------------------------------------
// LinkedIn
// ---------------------------------------------------------------------------

describe('linkedin linkedinPostsToLinks', () => {
  const posts = [
    {
      id: 'urn:li:share:100',
      author: 'urn:li:person:abc',
      authorName: 'Carol Danvers',
      commentary: 'First post',
      createdAt: 1_700_000_000,
      lastModifiedAt: 1_700_001_000,
      lifecycleState: 'PUBLISHED',
    },
    {
      id: 'urn:li:share:200',
      author: 'urn:li:person:def',
      commentary: 'Second post — not edited',
      createdAt: 1_700_002_000,
      lastModifiedAt: 1_700_002_000,
    },
  ];

  test('each link has non-null raw', () => {
    const links = linkedinPostsToLinks(posts);
    assert.equal(links.length, 2);
    for (const link of links) {
      assert.ok(
        link.raw !== null && link.raw !== undefined,
        `raw missing on ${link.id}`
      );
    }
  });

  test('produces edited when lastModifiedAt differs from createdAt', () => {
    const links = linkedinPostsToLinks(posts);
    assert.equal(links[0].edited, 1_700_001_000);
    assert.equal(links[1].edited ?? null, null);
  });

  test('raw contains id, author and lifecycleState', () => {
    const [link] = linkedinPostsToLinks(posts);
    assert.equal(link.raw.id, 'urn:li:share:100');
    assert.equal(link.raw.author, 'urn:li:person:abc');
    assert.equal(link.raw.lifecycleState, 'PUBLISHED');
  });

  test('senderName comes from authorName', () => {
    const [link] = linkedinPostsToLinks(posts);
    assert.equal(link.senderName, 'Carol Danvers');
  });
});

describe('linkedin parseArchive CSV-style', () => {
  const archive = {
    messages: [
      {
        CONVERSATION_ID: 'conv-99',
        DATE: '2024-05-10 10:30:00',
        FROM: 'Dave',
        CONTENT: 'Hey!',
        CONVERSATION_TITLE: 'Project Alpha Chat',
      },
    ],
  };

  test('produces chatName from CONVERSATION_TITLE', async () => {
    const links = await linkedinSource.parseArchive(archive);
    assert.equal(links.length, 1);
    assert.equal(links[0].chatName, 'Project Alpha Chat');
  });

  test('produces raw with id', async () => {
    const links = await linkedinSource.parseArchive(archive);
    assert.ok(links[0].raw !== null && links[0].raw !== undefined);
    assert.equal(links[0].raw.id, 'conv-99');
    assert.equal(links[0].raw.date, '2024-05-10 10:30:00');
  });
});
