import { readAssignmentPage } from './read-page.js';
import { readAssignmentSourceDocument } from './source-document.js';
import { assignmentSourceUrl } from './validation.js';
import { assignmentSourceReceipt } from './source.js';

/** Explicit instruction URLs use a separate profile, never the review browser. */
export const createAssignmentSourceReader =
  ({ store, openSession }) =>
  async (value, { signal } = {}) => {
    const url = assignmentSourceUrl(value);
    return readAssignmentPage({
      store,
      openSession,
      signal,
      url,
      platform: 'forms',
      slot: 'assignment-source',
      kind: 'source',
      redirects: true,
      read: readAssignmentSourceDocument,
      validate: async (read) =>
        (
          await assignmentSourceReceipt(
            {
              ...read,
              requestedUrl: url,
              capturedAt: new Date().toISOString(),
            },
            url
          )
        ).source,
    });
  };
