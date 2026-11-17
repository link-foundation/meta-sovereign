import { makeBrowserCommander } from 'browser-commander';
import { createAssignmentVacancyReader } from '../../js/src/assignments/vacancy-reader.js';
import {
  salaryVacancySnapshot,
  salaryVacancyUrl,
} from './salary-vacancy-fixture.mjs';

/** A real vacancy reader on a separate, entirely routed disposable page. */
export const salaryVacancyBrowserReader = (browser) => {
  const records = [];
  const readVacancy = createAssignmentVacancyReader({
    openSession: async ({ slot, useCase }) => {
      const record = { slot, useCase, closed: false, navigation: [] };
      records.push(record);
      const owned = await browser.newContext();
      await owned.route('**/*', (route) => {
        const url = route.request().url();
        record.navigation.push(url);
        if (url !== salaryVacancyUrl) {
          return route.abort();
        }
        const value = salaryVacancySnapshot();
        const fields = {
          title: 'vacancy-title',
          company: 'vacancy-company-name',
          salary: 'vacancy-salary',
          description: 'vacancy-description',
        };
        return route.fulfill({
          contentType: 'text/html',
          body: `<!doctype html><meta charset="utf-8">${Object.entries(fields)
            .map(([key, qa]) => `<p data-qa="${qa}">${value[key]}</p>`)
            .join('')}`,
        });
      });
      const page = await owned.newPage();
      const commander = makeBrowserCommander({
        page,
        enableNetworkTracking: false,
        enableNavigationManager: false,
        enableDialogManager: false,
      });
      return {
        page,
        commander,
        close: async () => {
          await commander.destroy();
          await owned.close();
          record.closed = true;
        },
      };
    },
  });
  return { readVacancy, records };
};

export const mountSalaryVacancy = async ({ page }) =>
  page.evaluate(() => {
    const header = document.createElement('header');
    const company = document.createElement('strong');
    company.dataset.qa = 'participant-info-title';
    company.textContent = 'Example employer';
    const vacancy = document.createElement('div');
    vacancy.dataset.qa = 'chatik-header-sub-header';
    const link = document.createElement('a');
    link.href = 'https://hh.ru/vacancy/123';
    link.textContent = 'Platform engineer';
    vacancy.append(link);
    header.append(company, vacancy);
    document.querySelector('main').before(header);
  });
