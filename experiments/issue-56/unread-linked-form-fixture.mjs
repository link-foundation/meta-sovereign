import { makeBrowserCommander } from 'browser-commander';

export const sharedQuestionnaire = 'https://forms.gle/JobQuestionnaire';
export const respondentQuestionnaire =
  'https://docs.google.com/forms/d/e/JobQuestionnaire/viewform';
export const employerQuestionnaire = `Please fill out the <a href="${sharedQuestionnaire}">form</a>.`;
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><title>Employer questionnaire</title>
<style>body{max-width:560px;margin:32px auto;padding:0 16px;font:16px system-ui}label,input,button{display:block;margin:12px 0}input{padding:8px;border:1px solid #666;border-radius:6px}</style>
<h1>Employer questionnaire</h1><form method="post">
<label>What time can you start?<input id="start" required></label>
<label>Availability notes<input id="notes" value="Owner entered this"></label>
<button type="submit">Submit</button></form>
<script>globalThis.submits=0;document.addEventListener('submit',event=>{event.preventDefault();globalThis.submits++;});</script></html>`;

export const linkedFormBrowser = (
  browser,
  {
    resolved = respondentQuestionnaire,
    destination = respondentQuestionnaire,
  } = {}
) => {
  const visits = [];
  const pages = [];
  return {
    visits,
    pages,
    forms: {
      availability: async () => ({
        available: true,
        missing: [],
        reason: null,
      }),
      review: { autoCapture: false, learn: false },
      async openSession() {
        const context = await browser.newContext();
        const page = await context.newPage();
        pages.push(page);
        await context.route('**/*', (route) => {
          const url = route.request().url();
          visits.push([route.request().method(), url]);
          if (url === sharedQuestionnaire) {
            return route.fulfill({
              contentType: 'text/html',
              body: `<script>location.replace(${JSON.stringify(resolved).replaceAll('<', '\\u003c')})</script>`,
            });
          }
          if (url === destination) {
            return route.fulfill({ contentType: 'text/html', body: html });
          }
          return route.abort();
        });
        const commander = makeBrowserCommander({
          page,
          enableNetworkTracking: false,
          enableNavigationManager: false,
          enableDialogManager: false,
        });
        const goto = commander.goto.bind(commander);
        commander.goto = async (input) => {
          const result = await goto(input);
          if (input.url === sharedQuestionnaire) {
            await page.waitForURL(resolved, { waitUntil: 'domcontentloaded' });
          }
          return result;
        };
        return {
          page,
          commander,
          policy: { headless: true },
          async close() {
            await commander.destroy();
            await context.close();
          },
        };
      },
    },
  };
};
