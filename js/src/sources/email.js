/**
 * Email source adapter (issue #3; R-Z5).
 *
 * The facade over three modules: ./email-mime.js reads raw messages,
 * ./email-records.js turns mail (raw or a provider's JSON) into message
 * links, and ./email-live.js talks to the mail servers. Browser-capable
 * mail APIs (JMAP, Gmail, Microsoft Graph) are plain HTTP fetches and
 * can run directly in the SPA when CORS allows them; raw protocols
 * (IMAP, POP3, SMTP) need the local server's transport.
 */

import { parseEmailArchive } from './email-records.js';
import { emailLiveActions } from './email-live.js';

export {
  buildEmailMessageLink,
  normalizeEmailRecord,
  parseEmailArchive,
  parseRfc822Message,
  parseAddressList,
} from './email-records.js';
export { buildRfc822, composeMessage } from './email-compose.js';
export { setAttachmentSink } from './email-mime.js';
export {
  EMAIL_PROTOCOLS,
  createEmailLive,
  protocolFor,
  setEmailTransportFactory,
} from './email-live.js';

export const emailSource = {
  name: 'email',
  parseArchive: parseEmailArchive,
  ...emailLiveActions,
};
