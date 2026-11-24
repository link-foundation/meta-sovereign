import { applicationNativeFixture } from './application-native-fixture.mjs';
import { originalApplicationSearch } from './application-search-route-fixture.mjs';
import { saveAnswerRule } from '../../js/src/automation/question-store.js';
import { saveSettings } from '../../js/src/automation/safety.js';

export const recruiterPanelChatUrl = 'https://chatik.hh.ru/chat/456';
export const recruiterPanelDraft = 'I am reviewing the interview details.';
export const recruiterPanelQuestion = 'Could you confirm your availability?';
export const recruiterPanelReply = 'I can start on December 7.';
export const recruiterPanelSavedQuestion = 'Can you confirm your availability?';
export const recruiterPanelSavedDraft = 'I am available next Wednesday.';
export const recruiterPanelChoiceQuestion =
  'Would you prefer a video interview?';
export const recruiterPanelChoices = ['Yes, video', 'No, in person'];
export const recruiterReuseQuestion = 'Можно ли работать удалённо?';
export const recruiterReuseAnswer = 'Да.';
export const recruiterReuseOptions = [
  'Да. Используем те же ответы',
  'Нет. Отвечу заново',
];
const panel = `<aside data-qa="chatik-root" aria-label="Recruiter chat" style="position:fixed;inset:20px 20px auto auto;width:360px;border:1px solid #aaa;padding:12px;background:#fff">
  <button type="button" data-qa="chatik-close" onclick="console.info('fixture recruiter panel dismissed'); this.closest('aside').hidden = true">Close recruiter panel</button>
  <iframe title="Recruiter chat" src="${recruiterPanelChatUrl}" style="display:block;width:100%;height:200px;border:0"></iframe>
</aside>`;

export const applicationRecruiterPanelFixture = async (
  browser,
  {
    panelDelayMs = 0,
    ownerReply = false,
    prepareReply = false,
    exactReply = false,
    reuseReply = false,
  } = {}
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
          ${prepareReply ? '<div id="recruiter-messages" style="height:68px;overflow:auto"><div style="height:100px"></div>' : ''}
          <article data-qa="chatik-chat-message-1" data-time="2026-11-24T09:00:00Z"><p data-qa="chat-bubble-text">${recruiterPanelQuestion}</p></article>${prepareReply ? '</div>' : ''}
          <label>Your reply <textarea data-qa="text-input">${recruiterPanelDraft}</textarea></label>
          ${
            ownerReply || prepareReply || exactReply || reuseReply
              ? `<button type="button" data-qa="send-message">Send reply</button>
          <script>
            globalThis.fixtureRecruiterSends=0;
            globalThis.fixtureRecruiterDraftWrites=0;
            document.querySelector('[data-qa="text-input"]').addEventListener('input',event=>{
              if (!event.isTrusted) globalThis.fixtureRecruiterDraftWrites++;
            });
            const input=document.querySelector('[data-qa="text-input"]');
            const send=document.querySelector('[data-qa="send-message"]');
            function acknowledge(text, explicitId) {
              const id=explicitId ?? 2+2*globalThis.fixtureRecruiterSends;
              globalThis.fixtureRecruiterSends++;
              const row=document.createElement('article');
              row.dataset.qa='chatik-chat-message-'+id;
              row.dataset.time='2026-11-24T09:01:00Z';
              const body=document.createElement('p');
              body.dataset.qa='chat-bubble-text';
              body.textContent=text;
              const delivery=document.createElement('span');
              delivery.dataset.qa=${JSON.stringify(exactReply || reuseReply ? 'status-icon-delivered' : 'status-icon-pending')};
              delivery.textContent=${JSON.stringify(exactReply || reuseReply ? 'Delivered' : 'Sending')};
              row.append(body,delivery);
              input.closest('label').before(row);
              input.value='';
            }
            send.onclick=()=>{
              if (input.value.trim() && !globalThis.fixtureRecruiterSends) acknowledge(input.value);
            };
            globalThis.fixtureRecruiterChoices=(exact)=>{
              const existing=document.querySelector('[data-qa="chatik-chat-message-3"]');
              const row=existing || document.createElement('article');
              row.dataset.qa='chatik-chat-message-3';
              row.dataset.time='2026-11-24T09:02:00Z';
              row.innerHTML='<p data-qa="chat-bubble-text">${recruiterPanelChoiceQuestion}</p><div data-qa="answer-options"></div>';
              const label=input.closest('label');
              label.hidden=true;
              send.hidden=true;
              label.before(row);
              for (const text of ${JSON.stringify(recruiterPanelChoices)}) {
                const choice=document.createElement('button');
                choice.textContent=exact ? text : text+'.';
                choice.onclick=()=>{
                  row.querySelector('[data-qa="answer-options"]').remove();
                  acknowledge(choice.textContent);
                };
                row.querySelector('[data-qa="answer-options"]').append(choice);
              }
            };
            globalThis.fixtureRecruiterReuse=({id, summary})=>{
              const label=input.closest('label');
              const rowFor=(number, text)=>{
                const node=document.querySelector('[data-qa="chatik-chat-message-'+number+'"]') ?? document.createElement('article');
                node.dataset.qa='chatik-chat-message-'+number;
                node.dataset.time='2026-11-24T09:02:00Z';
                node.innerHTML='<p data-qa="chat-bubble-text"></p>';
                node.firstElementChild.style.whiteSpace='pre-line';
                node.firstElementChild.textContent=text;
                label.before(node);
                return node;
              };
              rowFor(id-1,summary);
              const row=rowFor(id,'Используем эти ответы?');
              const options=document.createElement('div');
              options.dataset.qa='answer-options';
              label.hidden=true;
              send.hidden=true;
              for (const text of ${JSON.stringify(recruiterReuseOptions)}) {
                const choice=document.createElement('button');
                choice.textContent=text;
                choice.onclick=()=>{
                  options.remove();
                  acknowledge(choice.textContent,id+1);
                };
                options.append(choice);
              }
              row.append(options);
            };
          </script>`
              : ''
          }</body></html>`,
      });
      return true;
    },
  });
  if (prepareReply) {
    await saveAnswerRule(fixture.runtimeStore, {
      id: 'qa-rule:recruiter-panel-availability',
      question: recruiterPanelSavedQuestion,
      answers: [{ text: recruiterPanelSavedDraft, approved: true }],
    });
  }
  if (exactReply) {
    await saveSettings(fixture.runtimeStore, {
      quietHours: { enabled: false },
    });
    for (const [key, question, answer] of [
      ['availability', recruiterPanelQuestion, recruiterPanelSavedDraft],
      ['interview', recruiterPanelChoiceQuestion, recruiterPanelChoices[0]],
    ]) {
      await saveAnswerRule(fixture.runtimeStore, {
        id: `qa-rule:recruiter-panel-${key}`,
        question,
        answers: [{ text: answer, approved: true }],
      });
    }
  }
  if (reuseReply) {
    await saveSettings(fixture.runtimeStore, {
      quietHours: { enabled: false },
    });
    await saveAnswerRule(fixture.runtimeStore, {
      id: 'qa-rule:recruiter-panel-reuse',
      question: recruiterReuseQuestion,
      answers: [{ text: recruiterReuseAnswer, approved: true }],
    });
  }
  return { ...fixture, searchVisits, effects };
};
