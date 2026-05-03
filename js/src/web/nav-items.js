// Static catalogue of SPA top-level surfaces. Kept in its own module so
// tests and the connection-guide registry can import it without pulling
// in React, dom.js, and the rest of the SPA module subtree (which would
// otherwise leak microtasks on Deno's strict test runner).

export const navItems = [
  ['chat', 'Chat'],
  ['operator', 'Operator'],
  ['contacts', 'Contacts'],
  ['automation', 'Automation'],
  ['patterns', 'Patterns'],
  ['replies', 'Replies'],
  ['facts', 'Facts'],
  ['audience', 'Audience'],
  ['broadcast', 'Broadcast'],
  ['outreach', 'Outreach'],
  ['profile', 'Profile'],
  ['backup', 'Backup'],
  ['status', 'Status'],
  ['settings', 'Settings'],
];
