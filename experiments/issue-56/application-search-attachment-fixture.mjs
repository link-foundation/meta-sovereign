import { applicationNativeFixture } from './application-native-fixture.mjs';
import { originalApplicationSearch } from './application-search-route-fixture.mjs';

const card = (id, offer = true) => `<article data-qa="vacancy-serp__vacancy">
  <a data-qa="serp-item__title" href="/vacancy/${id}?from=search">Fixture job ${id}</a>
  <span data-qa="vacancy-serp__vacancy_responded">Application sent</span>
  ${offer ? `<span data-qa="vacancy-response-letter-informer"><button type="button" data-qa="vacancy-response-letter-toggle" onclick="openLetter(this,'${id}')">Attach a letter</button></span>` : ''}
</article>`;

const searchHtml = ({ mode, ownerDraft }) => `<!doctype html><html><body>
  <h1>Reviewed search results</h1><input value="Python" aria-label="Search">
  ${card('1234')}${card('123', mode !== 'fallback')}${mode === 'duplicate' ? card('123') : ''}
  <div id="portal"></div>
  <script>
    globalThis.fixtureClicks=0;
    globalThis.letterOpens=[];
    globalThis.letterSends=[];
    document.addEventListener('click',()=>globalThis.fixtureClicks++);
    function openLetter(button,id) {
      globalThis.letterOpens.push(id);
      const portal=document.querySelector('#portal');
      portal.innerHTML='<form role="dialog" aria-label="Separate letter" action="/applicant/vacancy_response?vacancyId='+id+'"><label>Cover letter<textarea data-qa="vacancy-response-popup-form-letter-input"></textarea></label><button type="submit" data-qa="vacancy-response-letter-submit" disabled>Send letter</button></form>';
      const form=portal.querySelector('form');
      const letter=form.querySelector('textarea');
      form.oninput=()=>{ form.querySelector('button').disabled=!letter.value; };
      form.onsubmit=(event)=>{
        event.preventDefault();
        globalThis.letterSends.push({id,text:letter.value});
        button.parentElement.remove();
        form.remove();
      };
      if (${Boolean(ownerDraft)}) {
        letter.value='An existing owner letter';
        form.oninput();
      }
    }
  </script></body></html>`;

export const applicationSearchAttachmentFixture = (browser, options = {}) => {
  const searches = [];
  return applicationNativeFixture(browser, {
    instantApplication: true,
    alreadyDelivered: true,
    separateLetterOffer: options.mode === 'fallback',
    searchRoute: async (route, url) => {
      if (url.href !== originalApplicationSearch) {
        return false;
      }
      searches.push(url.href);
      await route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: searchHtml(options),
      });
      return true;
    },
  }).then((fixture) => ({ ...fixture, searches }));
};
export { originalApplicationSearch };
