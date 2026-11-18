import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MessageBubble } from '../src/web/chat-message.js';

test('shared chat bubbles respect explicit provider direction while retaining real sender IDs', () => {
  const render = (patch) =>
    renderToStaticMarkup(
      React.createElement(MessageBubble, {
        message: {
          id: 'msg:hh:chat:41:2',
          source: 'hh',
          chat: 'chat:41',
          sender: 'applicant-56',
          body: 'Vietnam.',
          timestamp: '2026-11-10T10:00:02Z',
          ...patch,
        },
        isPersonal: true,
      })
    );
  assert.match(render({ outgoing: true }), /class="bubble out\b/u);
  assert.match(render({ outgoing: true }), /data-mine="true"/u);
  assert.match(render({ outgoing: false }), /class="bubble in\b/u);
  assert.match(render({}), /class="bubble in\b/u);
  assert.match(render({ sender: 'me' }), /class="bubble out\b/u);
});
