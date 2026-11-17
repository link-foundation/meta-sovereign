import { salaryOptionConfig } from './salary-option-fixture.mjs';

export const clarificationSalary = {
  ...salaryOptionConfig,
  defaultCurrency: 'RUB',
  currencies: [
    { code: 'RUB', keywords: ['RUB'], net: 450000, gross: 530000 },
    ...salaryOptionConfig.currencies,
    { code: 'EUR', keywords: ['EUR'], net: 5500, gross: 6500 },
  ],
};
export const salaryAnchor = 'Ваши зарплатные ожидания в долларах?';
export const salaryClarification =
  'Алексей подскажи пожалуйста цифры в долларах и до вычета налогов, спасибо!';
export const salaryClarificationAnswer = 'От $7 100 в месяц до вычета налогов.';
