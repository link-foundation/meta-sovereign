import { makeBrowserCommander } from 'browser-commander';

export const pollUrl = 'https://rating.hh.ru/poll';
export const employerRatingInvite = `Please rate our company. <a href="${pollUrl}">HeadHunter</a>`;
export const ratingSessionCookie = {
  name: 'fixture_rating_session',
  value: 'synthetic',
  domain: '.hh.ru',
  path: '/',
  secure: true,
  httpOnly: true,
};

const pageContent = (
  content
) => `<!doctype html><html lang="ru"><meta charset="utf-8">
<title>Рейтинг работодателей · тестовая страница</title>
<style>body{max-width:600px;margin:40px auto;padding:0 16px;font:16px system-ui} label{display:block;margin:16px 0}input[type="search"]{padding:8px;border:1px solid #666;border-radius:6px}button{margin-top:12px}</style>
<main>${content}</main></html>`;

const votingMarkup = (signedIn) =>
  pageContent(`
<h1>Рейтинг работодателей</h1>
${signedIn ? '<nav><a href="https://hh.ru/account/logout">Выйти</a></nav>' : '<nav><a href="https://hh.ru/account/login">Войти</a></nav>'}
<label>Найти компанию <input type="search" id="company"></label>
<form method="post">
<fieldset><legend>Оцените работодателя</legend>
<label><input type="radio" name="score" value="5"> 5 · Отлично</label>
<label><input type="radio" name="score" value="1"> 1 · Плохо</label>
</fieldset><button type="submit">Отправить оценку</button></form>
<script>
globalThis.searches = []; globalThis.submits = 0;
document.querySelector('#company').addEventListener('input', event => searches.push(event.target.value));
document.addEventListener('submit', event => { event.preventDefault(); submits++; });
</script>`);

export const ratingReviewBrowser = (browser, { seasonal = false } = {}) => {
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
      async openSession() {
        const context = await browser.newContext();
        const page = await context.newPage();
        pages.push(page);
        await context.route('**/*', async (route) => {
          if (route.request().url() !== pollUrl) {
            return route.abort();
          }
          const cookies = (await route.request().allHeaders()).cookie ?? '';
          const signedIn = cookies
            .split(/;\s*/u)
            .includes(
              `${ratingSessionCookie.name}=${ratingSessionCookie.value}`
            );
          visits.push({ method: route.request().method(), signedIn });
          return route.fulfill({
            contentType: 'text/html',
            body: seasonal
              ? pageContent(
                  '<h1>Подводим итоги 2026 года — результаты будут в феврале</h1>'
                )
              : votingMarkup(signedIn),
          });
        });
        const commander = makeBrowserCommander({
          page,
          enableNetworkTracking: false,
          enableNavigationManager: false,
          enableDialogManager: false,
        });
        return {
          page,
          commander,
          policy: { headless: false },
          async close() {
            await commander.destroy();
            await context.close();
          },
        };
      },
    },
  };
};
