/**
 * vietnamworks.com source adapter (R-E12).
 *
 * VietnamWorks keeps candidate–recruiter threads inside its Next.js
 * application (`/my-jobs`, `/my-profile`) with no public API. The
 * adapter parses the conversation dump the site mails on request and
 * routes resume writes through the VietnamWorks CV plan.
 */

import { createJobBoardSource } from './job-board.js';

export const vietnamworksSource = createJobBoardSource({
  name: 'vietnamworks',
  collections: ['conversations', 'messages', 'applications'],
  aliases: {
    sender: ['from', 'sender', 'senderName', 'employer', 'companyName'],
    chat: ['chat', 'conversationId', 'jobId', 'applicationId'],
  },
  chatPrefix: 'job',
  inboxUrl: 'https://www.vietnamworks.com/my-jobs',
  notes: [
    'Profile data is fetched client-side after login, so reads need a real browser session.',
    'Authentication happens on secure.vietnamworks.com and drops the www session cookie.',
  ],
});
