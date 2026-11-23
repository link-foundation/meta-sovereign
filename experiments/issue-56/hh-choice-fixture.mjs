import { providerChoiceHtml } from './provider-choice-fixture.mjs';
import { conversationHistoryHtml } from './conversation-history-fixture.mjs';

/** HH-shaped native controls at routed official origins; never contacts an account. */
export const hhChoiceHtml = providerChoiceHtml.replace(
  'row.append(p);',
  'row.append(p);if(row.className){const status=document.createElement("span");status.dataset.qa="status-icon-delivered";row.append(status);}'
);
export const hhApplicationHtml = (
  frames = '<iframe src="https://chatik.hh.ru/chat/7"></iframe>'
) =>
  `<!doctype html><html lang="en"><meta charset="utf-8"><title>HH application fixture</title><style>body{font:17px system-ui;background:#edf1f7;color:#20252b;padding:16px}h1{font-size:22px}iframe{width:100%;height:680px;border:1px solid #ccd2dc;background:white;border-radius:12px}</style><nav data-qa="mainmenu_applicantProfile">Applicant profile · isolated fixture</nav><h1>Application · embedded employer conversation</h1>${frames}</html>`;

export const hhBrowserImportHtml = (url) => {
  if (
    /^\/chat\/[78]$/u.test(url.pathname) &&
    url.searchParams.has('history-import')
  ) {
    return conversationHistoryHtml({
      marker: !url.searchParams.has('no-start'),
    });
  }
  if (url.pathname === '/chat/7' || url.pathname === '/chat/8') {
    return hhChoiceHtml.replace(
      '<main id="history">',
      `<aside data-qa="chatik-open-chat-${url.pathname.at(-1)}"><span data-qa="chat-cell-title">Example employer</span><span data-qa="chat-unread-count">2</span></aside><main id="history">`
    );
  }
  if (url.pathname === '/chat' && url.searchParams.has('embedded')) {
    return hhApplicationHtml(
      `<iframe src="https://chatik.hh.ru/chat/7"></iframe>${url.searchParams.has('ambiguous') ? '<iframe src="https://chatik.hh.ru/chat/8"></iframe>' : ''}`
    );
  }
  return '<!doctype html><title>HeadHunter fixture</title><a href="/chat/7">Example employer</a>';
};
