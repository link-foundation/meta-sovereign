/**
 * topcv.vn source adapter (R-E13).
 *
 * TopCV exposes candidate messages only inside its web application
 * (`/tin-nhan`), so the adapter parses the exported notification dump
 * and sends resume writes to the TopCV CV plan.
 */

import { createJobBoardSource } from './job-board.js';

export const topcvSource = createJobBoardSource({
  name: 'topcv',
  collections: ['messages', 'notifications', 'tin_nhan'],
  aliases: {
    sender: ['from', 'sender', 'senderName', 'company', 'nha_tuyen_dung'],
    chat: ['chat', 'conversationId', 'jobId', 'tin_tuyen_dung'],
    body: ['message', 'body', 'text', 'content', 'noi_dung'],
    timestamp: ['date', 'timestamp', 'createdAt', 'thoi_gian'],
  },
  chatPrefix: 'job',
  inboxUrl: 'https://www.topcv.vn/tin-nhan',
  notes: [
    'TopCV keeps several CVs per account; the plan edits the online profile (/ho-so).',
    'The site is Vietnamese-first; the CV parser normalises "Tháng 10/2022"-style dates.',
  ],
});
