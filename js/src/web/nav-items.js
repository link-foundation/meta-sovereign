// Static catalogue of SPA top-level surfaces. Kept in its own module so
// tests and the connection-guide registry can import it without pulling
// in React, dom.js, and the rest of the SPA module subtree (which would
// otherwise leak microtasks on Deno's strict test runner).
//
// The second element of each pair is a translation key (resolved via
// i18n.t() at render time). The English literal lives in
// ./locales/en.js so language switching does not need a navItems
// rebuild (issue #18).

export const navItems = [
  ['chat', 'nav.chat'],
  ['operator', 'nav.operator'],
  ['contacts', 'nav.contacts'],
  ['automation', 'nav.automation'],
  ['patterns', 'nav.patterns'],
  ['replies', 'nav.replies'],
  ['facts', 'nav.facts'],
  ['audience', 'nav.audience'],
  ['broadcast', 'nav.broadcast'],
  ['outreach', 'nav.outreach'],
  ['profile', 'nav.profile'],
  ['backup', 'nav.backup'],
  ['status', 'nav.status'],
  ['connections', 'nav.connections'],
  ['settings', 'nav.settings'],
];
