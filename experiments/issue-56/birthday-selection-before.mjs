import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';

// Keep the actual current regression and fixture; replace only published UI modules.
const target = new URL(
  '../../js/tests/e2e-profile-extras-browser.mjs',
  import.meta.url
);
const source = `import { routePublishedWebBundle } from '../../experiments/issue-56/published-web-bundle.mjs';\n${readFileSync(
  target,
  'utf8'
).replace(
  'await page.clock.setFixedTime(today);',
  "await page.clock.setFixedTime(today);\nawait routePublishedWebBundle(page, 'ef34179a', ['js/src/web/chat-birthday-reminders.js', 'js/src/web/chat-person-extras.js']);"
)}`;
registerHooks({
  load(url, context, nextLoad) {
    return url === target.href
      ? { format: 'module', source, shortCircuit: true }
      : nextLoad(url, context);
  },
});
process.env.BIRTHDAY_SELECTION_BEFORE = '1';
await import(target.href);
