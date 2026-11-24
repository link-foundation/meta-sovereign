import { applicationNativeFixture } from './application-native-fixture.mjs';
import { originalApplicationSearch } from './application-search-route-fixture.mjs';

export const recruiterPanelChatUrl = 'https://chatik.hh.ru/chat/456';
export const recruiterPanelDraft = 'I am reviewing the interview details.';
const panel = `<aside data-qa="chatik-root" aria-label="Recruiter chat" style="position:fixed;inset:20px 20px auto auto;width:360px;border:1px solid #aaa;padding:12px;background:#fff">
  <button type="button" onclick="this.closest('aside').hidden = true">Close recruiter panel</button>
  <iframe title="Recruiter chat" src="${recruiterPanelChatUrl}" style="display:block;width:100%;height:200px;border:0"></iframe>
</aside>`;

export const applicationRecruiterPanelFixture = async (
  browser,
  { panelDelayMs = 0 } = {}
) => {
  const searchVisits = [];
  const effects = [];
  const returnedPanel = panelDelayMs
    ? `<script>setTimeout(()=>document.body.insertAdjacentHTML('beforeend',${JSON.stringify(panel)}),${panelDelayMs});</script>`
    : panel;
  const fixture = await applicationNativeFixture(browser, {
    ownerAnswers: {
      experience: 'Reviewed experience',
      letter: 'Reviewed letter',
    },
    onApplicationClose: (effect) => effects.push(effect),
    searchRoute: async (route, url) => {
      if (url.href !== originalApplicationSearch) {
        return false;
      }
      searchVisits.push(url.href);
      await route.fulfill({
        contentType: 'text/html; charset=utf-8',
        body: `<!doctype html><html><body><h1>Python vacancies</h1><label>Search <input value="Python"></label>
          <article><a data-qa="serp-item__title" href="/vacancy/789">Another Python vacancy</a></article>${searchVisits.length > 1 ? returnedPanel : ''}</body></html>`,
      });
      return true;
    },
    recruiterRoute: async (route, url) => {
      if (url.href !== recruiterPanelChatUrl) {
        return false;
      }
      await route.fulfill({
        contentType: 'text/html; charset=utf-8',
        body: `<!doctype html><html><body><h2 data-qa="participant-info-title">Recruiter chat</h2>
          <div data-qa="chatik-header-sub-header"><a href="https://hh.ru/vacancy/123">Python engineer</a></div>
          <article data-qa="chatik-chat-message-1"><p data-qa="chat-bubble-text">Could you confirm your availability?</p></article>
          <label>Your reply <textarea data-qa="text-input">${recruiterPanelDraft}</textarea></label></body></html>`,
      });
      return true;
    },
  });
  return { ...fixture, searchVisits, effects };
};
