/**
 * naukri.com source adapter (R-E11).
 *
 * Naukri's recruiter conversations live behind `/mnjuser/messages` and
 * are mirrored to the candidate's email; there is no documented
 * candidate API, so the adapter parses the exported inbox dump and
 * delegates resume writes to the Naukri CV plan.
 */

import { createJobBoardSource } from './job-board.js';

export const naukriSource = createJobBoardSource({
  name: 'naukri',
  collections: ['messages', 'inbox', 'recruiterMessages'],
  aliases: {
    sender: ['from', 'sender', 'recruiter', 'recruiterName', 'company'],
    chat: ['chat', 'conversationId', 'jobId', 'jobPostId', 'applicationId'],
  },
  chatPrefix: 'job',
  inboxUrl: 'https://www.naukri.com/mnjuser/messages',
  notes: [
    'Naukri throttles profile writes; the CV plan updates one section per visit.',
    'Recruiter messages are also delivered by email, which the email source can import.',
  ],
});
