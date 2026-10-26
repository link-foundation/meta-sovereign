// Line icons for the navigation and the header (PR #34 UI review). The
// shapes follow Lucide (https://lucide.dev, ISC licence, © Lucide
// Contributors); each is a list of SVG children on a 24 × 24 grid,
// drawn with `currentColor` so every theme and skin colours them.

import React from 'react';

const el = React.createElement;

const ICONS = {
  calls: [
    [
      'path',
      {
        d: 'M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.7.7A2 2 0 0 1 22 16.9Z',
      },
    ],
  ],
  chat: [['path', { d: 'M7.9 20A9 9 0 1 0 4 16.1L2 22Z' }]],
  // The emoji panel and its categories (R-Y104).
  smile: [
    ['circle', { cx: 12, cy: 12, r: 10 }],
    ['path', { d: 'M8 14s1.5 2 4 2 4-2 4-2' }],
    ['line', { x1: 9, y1: 9, x2: 9.01, y2: 9 }],
    ['line', { x1: 15, y1: 9, x2: 15.01, y2: 9 }],
  ],
  star: [
    [
      'polygon',
      {
        points:
          '12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2',
      },
    ],
  ],
  sticker: [
    [
      'path',
      {
        d: 'M15.5 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h9.5L21 14.5V5a2 2 0 0 0-2-2Z',
      },
    ],
    ['path', { d: 'M15 21v-4a2 2 0 0 1 2-2h4' }],
  ],
  gif: [
    ['rect', { x: 2, y: 5, width: 20, height: 14, rx: 2 }],
    ['path', { d: 'M10 10H8a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h2v-2h-1' }],
    ['line', { x1: 13, y1: 10, x2: 13, y2: 14 }],
    ['path', { d: 'M16 14v-4h2.5M16 12h2' }],
  ],
  leaf: [
    [
      'path',
      {
        d: 'M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z',
      },
    ],
    ['path', { d: 'M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12' }],
  ],
  apple: [
    [
      'path',
      {
        d: 'M12 20.94c1.5 0 2.75 1.06 4 1.06 3 0 6-8 6-12.22A4.91 4.91 0 0 0 17 5c-2.22 0-4 1.44-5 2-1-.56-2.78-2-5-2a4.9 4.9 0 0 0-5 4.78C2 14 5 22 8 22c1.25 0 2.5-1.06 4-1.06Z',
      },
    ],
    ['path', { d: 'M10 2c1 .5 2 2 2 5' }],
  ],
  ball: [
    ['circle', { cx: 12, cy: 12, r: 10 }],
    ['path', { d: 'M12 2a15 15 0 0 1 0 20' }],
    ['path', { d: 'M12 2a15 15 0 0 0 0 20' }],
    ['path', { d: 'M2 12h20' }],
  ],
  plane: [
    [
      'path',
      {
        d: 'M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z',
      },
    ],
  ],
  flag: [
    [
      'path',
      { d: 'M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z' },
    ],
    ['line', { x1: 4, y1: 22, x2: 4, y2: 15 }],
  ],
  operator: [
    ['rect', { x: 3, y: 3, width: 7, height: 9, rx: 1 }],
    ['rect', { x: 14, y: 3, width: 7, height: 5, rx: 1 }],
    ['rect', { x: 14, y: 12, width: 7, height: 9, rx: 1 }],
    ['rect', { x: 3, y: 16, width: 7, height: 5, rx: 1 }],
  ],
  contacts: [
    ['path', { d: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2' }],
    ['circle', { cx: 9, cy: 7, r: 4 }],
    ['path', { d: 'M22 21v-2a4 4 0 0 0-3-3.87' }],
    ['path', { d: 'M16 3.13a4 4 0 0 1 0 7.75' }],
  ],
  automation: [
    ['polygon', { points: '13 2 3 14 12 14 11 22 21 10 12 10 13 2' }],
  ],
  patterns: [
    [
      'path',
      {
        d: 'M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5c0 1.1.9 2 2 2h1',
      },
    ],
    [
      'path',
      {
        d: 'M16 21h1a2 2 0 0 0 2-2v-5c0-1.1.9-2 2-2a2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1',
      },
    ],
  ],
  replies: [
    ['polyline', { points: '9 17 4 12 9 7' }],
    ['path', { d: 'M20 18v-2a4 4 0 0 0-4-4H4' }],
  ],
  facts: [
    ['path', { d: 'M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z' }],
    ['path', { d: 'M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z' }],
  ],
  audience: [
    ['circle', { cx: 9, cy: 12, r: 6 }],
    ['circle', { cx: 15, cy: 12, r: 6 }],
  ],
  broadcast: [
    ['path', { d: 'm3 11 18-5v12L3 14v-3z' }],
    ['path', { d: 'M11.6 16.8a3 3 0 1 1-5.8-1.6' }],
  ],
  outreach: [
    ['path', { d: 'm22 2-7 20-4-9-9-4Z' }],
    ['path', { d: 'M22 2 11 13' }],
  ],
  profile: [
    ['path', { d: 'M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2' }],
    ['circle', { cx: 12, cy: 7, r: 4 }],
  ],
  backup: [
    ['ellipse', { cx: 12, cy: 5, rx: 9, ry: 3 }],
    ['path', { d: 'M3 5v14a9 3 0 0 0 18 0V5' }],
    ['path', { d: 'M3 12a9 3 0 0 0 18 0' }],
  ],
  status: [['polyline', { points: '22 12 18 12 15 21 9 3 6 12 2 12' }]],
  connections: [
    [
      'path',
      { d: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71' },
    ],
    [
      'path',
      { d: 'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71' },
    ],
  ],
  cv: [
    [
      'path',
      { d: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' },
    ],
    ['polyline', { points: '14 2 14 8 20 8' }],
    ['line', { x1: 16, y1: 13, x2: 8, y2: 13 }],
    ['line', { x1: 16, y1: 17, x2: 8, y2: 17 }],
  ],
  greetings: [
    ['rect', { x: 3, y: 8, width: 18, height: 4, rx: 1 }],
    ['path', { d: 'M12 8v13' }],
    ['path', { d: 'M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7' }],
    [
      'path',
      {
        d: 'M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5',
      },
    ],
  ],
  settings: [
    ['line', { x1: 4, y1: 21, x2: 4, y2: 14 }],
    ['line', { x1: 4, y1: 10, x2: 4, y2: 3 }],
    ['line', { x1: 12, y1: 21, x2: 12, y2: 12 }],
    ['line', { x1: 12, y1: 8, x2: 12, y2: 3 }],
    ['line', { x1: 20, y1: 21, x2: 20, y2: 16 }],
    ['line', { x1: 20, y1: 12, x2: 20, y2: 3 }],
    ['line', { x1: 2, y1: 14, x2: 6, y2: 14 }],
    ['line', { x1: 10, y1: 8, x2: 14, y2: 8 }],
    ['line', { x1: 18, y1: 16, x2: 22, y2: 16 }],
  ],
  // The "⋯" of a menu button (R-Y186).
  dots: [
    ['circle', { cx: 5, cy: 12, r: 1.4 }],
    ['circle', { cx: 12, cy: 12, r: 1.4 }],
    ['circle', { cx: 19, cy: 12, r: 1.4 }],
  ],
  more: [
    ['rect', { x: 3, y: 3, width: 7, height: 7, rx: 1 }],
    ['rect', { x: 14, y: 3, width: 7, height: 7, rx: 1 }],
    ['rect', { x: 14, y: 14, width: 7, height: 7, rx: 1 }],
    ['rect', { x: 3, y: 14, width: 7, height: 7, rx: 1 }],
  ],
  // A bot's Menu button (R-Y135).
  menu: [
    ['line', { x1: 4, y1: 6, x2: 20, y2: 6 }],
    ['line', { x1: 4, y1: 12, x2: 20, y2: 12 }],
    ['line', { x1: 4, y1: 18, x2: 20, y2: 18 }],
  ],
  sun: [
    ['circle', { cx: 12, cy: 12, r: 4 }],
    [
      'path',
      {
        d: 'M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41',
      },
    ],
  ],
  moon: [['path', { d: 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z' }]],
  help: [
    ['circle', { cx: 12, cy: 12, r: 10 }],
    ['path', { d: 'M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3' }],
    ['path', { d: 'M12 17h.01' }],
  ],
  globe: [
    ['circle', { cx: 12, cy: 12, r: 10 }],
    ['path', { d: 'M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20' }],
    ['path', { d: 'M2 12h20' }],
  ],
  back: [
    ['path', { d: 'm12 19-7-7 7-7' }],
    ['path', { d: 'M19 12H5' }],
  ],
  send: [
    ['path', { d: 'm5 12 7-7 7 7' }],
    ['path', { d: 'M12 19V5' }],
  ],
  plus: [
    ['path', { d: 'M5 12h14' }],
    ['path', { d: 'M12 5v14' }],
  ],
  close: [
    ['path', { d: 'M18 6 6 18' }],
    ['path', { d: 'm6 6 12 12' }],
  ],
  search: [
    ['circle', { cx: 11, cy: 11, r: 8 }],
    ['path', { d: 'm21 21-4.3-4.3' }],
  ],
  eraser: [
    [
      'path',
      {
        d: 'm7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21',
      },
    ],
    ['path', { d: 'M22 21H7' }],
    ['path', { d: 'm5 11 9 9' }],
  ],
  'log-out': [
    ['path', { d: 'm16 17 5-5-5-5' }],
    ['path', { d: 'M21 12H9' }],
    ['path', { d: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4' }],
  ],
  paperclip: [
    ['path', { d: 'M13.234 20.252 21 12.3' }],
    [
      'path',
      {
        d: 'm16 6-8.414 8.586a2 2 0 0 0 0 2.828 2 2 0 0 0 2.828 0l8.414-8.586a4 4 0 0 0 0-5.656 4 4 0 0 0-5.656 0l-8.415 8.585a6 6 0 1 0 8.486 8.486',
      },
    ],
  ],
  // Lucide mic and lock: recording a voice message (R-Y108).
  mic: [
    ['path', { d: 'M12 19v3' }],
    ['path', { d: 'M19 10v2a7 7 0 0 1-14 0v-2' }],
    ['rect', { x: 9, y: 2, width: 6, height: 13, rx: 3 }],
  ],
  // Lucide phone: placing, taking and ending a private call (R-Y196).
  phone: [
    [
      'path',
      {
        d: 'M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384',
      },
    ],
  ],
  // Lucide video: recording a round video (R-Y150).
  camera: [
    [
      'path',
      {
        d: 'm16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5',
      },
    ],
    ['rect', { x: 2, y: 6, width: 14, height: 12, rx: 2 }],
  ],
  keyboard: [
    ['path', { d: 'M10 8h.01' }],
    ['path', { d: 'M12 12h.01' }],
    ['path', { d: 'M14 8h.01' }],
    ['path', { d: 'M16 12h.01' }],
    ['path', { d: 'M18 8h.01' }],
    ['path', { d: 'M6 8h.01' }],
    ['path', { d: 'M7 16h10' }],
    ['path', { d: 'M8 12h.01' }],
    ['rect', { width: 20, height: 16, x: 2, y: 4, rx: 2 }],
  ],
  lock: [
    ['rect', { width: 18, height: 11, x: 3, y: 11, rx: 2, ry: 2 }],
    ['path', { d: 'M7 11V7a5 5 0 0 1 10 0v4' }],
  ],
  'chevron-up': [['path', { d: 'm18 15-6-6-6 6' }]],
  'chevron-left': [['path', { d: 'm15 18-6-6 6-6' }]],
  'chevron-right': [['path', { d: 'm9 18 6-6-6-6' }]],
  calendar: [
    ['rect', { x: 3, y: 4, width: 18, height: 18, rx: 2 }],
    ['path', { d: 'M16 2v4' }],
    ['path', { d: 'M8 2v4' }],
    ['path', { d: 'M3 10h18' }],
  ],
  'chevron-down': [['path', { d: 'm6 9 6 6 6-6' }]],
  check: [['path', { d: 'M20 6 9 17l-5-5' }]],
  // Lucide check-check, clock and circle-alert: a message's delivery.
  'check-double': [
    ['path', { d: 'M18 6 7 17l-5-5' }],
    ['path', { d: 'm22 10-7.5 7.5L13 16' }],
  ],
  // Lucide timer: a chat's auto-delete timer and its messages (R-Y143).
  timer: [
    ['line', { x1: 10, x2: 14, y1: 2, y2: 2 }],
    ['line', { x1: 12, x2: 15, y1: 14, y2: 11 }],
    ['circle', { cx: 12, cy: 14, r: 8 }],
  ],
  clock: [
    ['circle', { cx: 12, cy: 12, r: 10 }],
    ['polyline', { points: '12 6 12 12 16 14' }],
  ],
  alert: [
    ['circle', { cx: 12, cy: 12, r: 10 }],
    ['line', { x1: 12, x2: 12, y1: 8, y2: 12 }],
    ['line', { x1: 12, x2: 12.01, y1: 16, y2: 16 }],
  ],
  // Media and the chat's own controls (filled where Telegram fills them).
  play: [['polygon', { points: '7 4 20 12 7 20 7 4', fill: 'currentColor' }]],
  pause: [
    ['rect', { x: 6, y: 4, width: 4, height: 16, rx: 1, fill: 'currentColor' }],
    [
      'rect',
      { x: 14, y: 4, width: 4, height: 16, rx: 1, fill: 'currentColor' },
    ],
  ],
  file: [
    [
      'path',
      { d: 'M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z' },
    ],
    ['path', { d: 'M14 2v4a2 2 0 0 0 2 2h4' }],
  ],
  'map-pin': [
    ['path', { d: 'M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z' }],
    ['circle', { cx: 12, cy: 10, r: 3 }],
  ],
  user: [
    ['path', { d: 'M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2' }],
    ['circle', { cx: 12, cy: 7, r: 4 }],
  ],
  // Lucide reply, pencil, copy, link, forward, circle-check, trash-2:
  // the message menu and the selection bar (R-Y67).
  reply: [
    ['polyline', { points: '9 17 4 12 9 7' }],
    ['path', { d: 'M20 18v-2a4 4 0 0 0-4-4H4' }],
  ],
  edit: [['path', { d: 'M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z' }]],
  copy: [
    ['rect', { x: 8, y: 8, width: 14, height: 14, rx: 2, ry: 2 }],
    ['path', { d: 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2' }],
  ],
  link: [
    [
      'path',
      { d: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71' },
    ],
    [
      'path',
      { d: 'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71' },
    ],
  ],
  forward: [
    ['polyline', { points: '15 17 20 12 15 7' }],
    ['path', { d: 'M4 18v-2a4 4 0 0 1 4-4h12' }],
  ],
  select: [
    ['circle', { cx: 12, cy: 12, r: 10 }],
    ['path', { d: 'm9 12 2 2 4-4' }],
  ],
  trash: [
    ['path', { d: 'M3 6h18' }],
    ['path', { d: 'M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6' }],
    ['path', { d: 'M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2' }],
  ],
  'arrow-down': [
    ['path', { d: 'M12 5v14' }],
    ['path', { d: 'm19 12-7 7-7-7' }],
  ],
  pin: [
    ['path', { d: 'M12 17v5' }],
    [
      'path',
      {
        d: 'M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z',
      },
    ],
  ],
  archive: [
    ['rect', { x: 2, y: 3, width: 20, height: 5, rx: 1 }],
    ['path', { d: 'M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8' }],
    ['path', { d: 'M10 12h4' }],
  ],
  unarchive: [
    ['rect', { x: 2, y: 3, width: 20, height: 5, rx: 1 }],
    ['path', { d: 'M4 8v11a2 2 0 0 0 2 2h2' }],
    ['path', { d: 'M20 8v11a2 2 0 0 1-2 2h-2' }],
    ['path', { d: 'm9 15 3-3 3 3' }],
    ['path', { d: 'M12 12v9' }],
  ],
  download: [
    ['path', { d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' }],
    ['path', { d: 'm7 10 5 5 5-5' }],
    ['path', { d: 'M12 15V3' }],
  ],
  image: [
    ['rect', { x: 3, y: 3, width: 18, height: 18, rx: 2, ry: 2 }],
    ['circle', { cx: 9, cy: 9, r: 2 }],
    ['path', { d: 'm21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21' }],
  ],
  quote: [
    [
      'path',
      {
        d: 'M3 21c3 0 7-1 7-8V5c0-1.25-.76-2-2-2H4c-1.25 0-2 .75-2 1.97V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .01-1 1.03V20c0 1 0 1 1 1z',
      },
    ],
    [
      'path',
      {
        d: 'M15 21c3 0 7-1 7-8V5c0-1.25-.76-2-2-2h-4c-1.25 0-2 .75-2 1.97V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z',
      },
    ],
  ],
  // Lucide bell: a chat's notifications (R-Y157).
  bell: [
    ['path', { d: 'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9' }],
    ['path', { d: 'M10.3 21a1.94 1.94 0 0 0 3.4 0' }],
  ],
  mute: [
    ['path', { d: 'M11 5 6 9H2v6h4l5 4V5z' }],
    ['path', { d: 'm22 9-6 6' }],
    ['path', { d: 'm16 9 6 6' }],
  ],
  volume: [
    ['path', { d: 'M11 5 6 9H2v6h4l5 4V5z' }],
    ['path', { d: 'M15.54 8.46a5 5 0 0 1 0 7.07' }],
    ['path', { d: 'M19.07 4.93a10 10 0 0 1 0 14.14' }],
  ],
  at: [
    ['circle', { cx: 12, cy: 12, r: 4 }],
    ['path', { d: 'M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8' }],
  ],
  heart: [
    [
      'path',
      {
        d: 'M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z',
      },
    ],
  ],
  // Lucide crop, rotate-ccw, flip-horizontal, pen, highlighter,
  // arrow-up-right and redo-2: the photo editor's tools (R-Y187).
  crop: [
    ['path', { d: 'M6 2v14a2 2 0 0 0 2 2h14' }],
    ['path', { d: 'M18 22V8a2 2 0 0 0-2-2H2' }],
  ],
  'rotate-left': [
    ['path', { d: 'M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8' }],
    ['path', { d: 'M3 3v5h5' }],
  ],
  flip: [
    ['path', { d: 'M8 3H5a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h3' }],
    ['path', { d: 'M16 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3' }],
    ['path', { d: 'M12 20v2M12 14v2M12 8v2M12 2v2' }],
  ],
  pen: [
    [
      'path',
      {
        d: 'M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z',
      },
    ],
    ['path', { d: 'm15 5 4 4' }],
  ],
  marker: [
    ['path', { d: 'm9 11-6 6v3h9l3-3' }],
    [
      'path',
      { d: 'm22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4' },
    ],
  ],
  'arrow-up-right': [
    ['path', { d: 'M7 7h10v10' }],
    ['path', { d: 'M7 17 17 7' }],
  ],
  redo: [
    ['path', { d: 'm15 14 5-5-5-5' }],
    ['path', { d: 'M20 9H9.5a5.5 5.5 0 0 0 0 11H13' }],
  ],
  // Lucide undo-2, octagon-x, lightbulb and chart-bar: a poll's
  // Retract vote, Stop poll, a quiz's explanation, View results (R-Y74).
  undo: [
    ['path', { d: 'M9 14 4 9l5-5' }],
    ['path', { d: 'M4 9h10.5a5.5 5.5 0 0 1 0 11H11' }],
  ],
  stop: [
    [
      'path',
      {
        d: 'M2.6 8.4 8.4 2.6a2 2 0 0 1 1.4-.6h4.4a2 2 0 0 1 1.4.6l5.8 5.8a2 2 0 0 1 .6 1.4v4.4a2 2 0 0 1-.6 1.4l-5.8 5.8a2 2 0 0 1-1.4.6H9.8a2 2 0 0 1-1.4-.6l-5.8-5.8a2 2 0 0 1-.6-1.4V9.8a2 2 0 0 1 .6-1.4z',
      },
    ],
    ['path', { d: 'm15 9-6 6' }],
    ['path', { d: 'm9 9 6 6' }],
  ],
  bulb: [
    [
      'path',
      {
        d: 'M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5',
      },
    ],
    ['path', { d: 'M9 18h6' }],
    ['path', { d: 'M10 22h4' }],
  ],
  // Views of a post, and picture-in-picture (R-Y182).
  eye: [
    ['path', { d: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z' }],
    ['circle', { cx: 12, cy: 12, r: 3 }],
  ],
  pip: [
    ['rect', { x: 2, y: 4, width: 20, height: 16, rx: 2 }],
    ['rect', { x: 12, y: 12, width: 8, height: 6, rx: 1 }],
  ],
  chart: [
    ['path', { d: 'M3 3v16a2 2 0 0 0 2 2h16' }],
    ['path', { d: 'M7 16h8' }],
    ['path', { d: 'M7 11h12' }],
    ['path', { d: 'M7 6h3' }],
  ],
};

export const iconNames = Object.keys(ICONS);

/** A decorative icon; the control around it carries the accessible name. */
export const Icon = ({ name, size = 20 }) =>
  el(
    'svg',
    {
      className: `icon icon-${name}`,
      width: size,
      height: size,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 2,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      'aria-hidden': 'true',
      focusable: 'false',
    },
    (ICONS[name] ?? []).map(([tag, attrs], i) => el(tag, { key: i, ...attrs }))
  );
