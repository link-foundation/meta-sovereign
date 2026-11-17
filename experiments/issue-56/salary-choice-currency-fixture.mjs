import { bandSalary } from './salary-band-safety-fixture.mjs';

export const choiceCurrencyCase = {
  question: 'What salary net do you expect?',
  options: ['USD up to 5000', 'USD 5001–7999'],
  salary: { ...bandSalary, defaultCurrency: null },
};
