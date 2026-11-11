/* global document, ResizeObserver, requestAnimationFrame, cancelAnimationFrame */
import React, { useLayoutEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { useLayoutTrace } from '../../js/src/web/chat-layout-trace.js';

const el = React.createElement;
const mode = new URL(globalThis.location.href).searchParams.get('mode');
const entries = (globalThis.layoutEntries = []);
const api = {
  clientLog(entry) {
    entries.push(entry);
    const status = document.querySelector('#status');
    status.textContent = `${entry.level}: bottom gap ${entry.bottomGap}px`;
    status.dataset.level = entry.level;
  },
};
const Fixture = () => {
  const box = useRef(null);
  const following = useRef(mode !== 'reading');
  const report = useLayoutTrace(
    api,
    box,
    {
      current: { chat: 'fixture', source: 'fixture' },
      messages: [{ id: '1' }],
    },
    following
  );
  useLayoutEffect(() => {
    const node = box.current;
    node.scrollTop = node.scrollHeight;
    let correction;
    const observer = new ResizeObserver(() => {
      if (mode !== 'persistent' && following.current) {
        correction = requestAnimationFrame(() => {
          node.scrollTop = node.scrollHeight;
        });
      }
    });
    observer.observe(node.querySelector('.chat-column'));
    report('end');
    // This frame is registered after the diagnostic's first frame. Its
    // ResizeObserver correction therefore runs after the diagnostic's second.
    const change = requestAnimationFrame(() => {
      node.querySelector('.late').style.height = '38px';
    });
    return () => {
      observer.disconnect();
      cancelAnimationFrame(correction);
      cancelAnimationFrame(change);
    };
  }, [report]);
  return el('main', { className: 'chat-main' }, [
    el(
      'div',
      { className: 'chat-scroll', ref: box, key: 'scroll' },
      el('div', { className: 'chat-column' }, [
        el(
          'div',
          { style: { height: 700 }, key: 'history' },
          'Earlier messages'
        ),
        el('div', { className: 'late', key: 'late' }),
        el(
          'div',
          { className: 'bubble-row', key: 'message' },
          'Latest message'
        ),
      ])
    ),
    el(
      'div',
      { className: 'chat-composer', key: 'composer' },
      'Message composer'
    ),
  ]);
};
const root = createRoot(document.querySelector('#root'));
root.render(el(Fixture));
globalThis.unmountFixture = () => root.unmount();
