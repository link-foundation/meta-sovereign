import { salaryOptionConfig } from './salary-option-fixture.mjs';

export const nearestBasesSalary = {
  ...salaryOptionConfig,
  currencies: [
    {
      ...salaryOptionConfig.currencies[0],
      net: 3500,
      gross: 4500,
    },
  ],
};
