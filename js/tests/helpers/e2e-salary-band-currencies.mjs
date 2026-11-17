import { verifySalaryBandSaved } from './e2e-salary-band-saved.mjs';
import { currencyBandCase } from '../../../experiments/issue-56/salary-band-currencies-fixture.mjs';

export const verifySalaryBandCurrencies = (browser) =>
  verifySalaryBandSaved(browser, {
    ...currencyBandCase(),
    group: 'salary-band-currencies',
    beforeVariable: 'SALARY_BAND_CURRENCIES_BEFORE',
    screenshotVariable: 'SALARY_BAND_CURRENCIES_SCREENSHOTS',
  });
