import { bandSalary, bandSavedRule } from './salary-band-safety-fixture.mjs';

export const currencyBandCase = (code = 'GBP', keyword = 'pounds') => {
  const question = `What salary in ${code} net do you expect?`;
  const options = [`${keyword} up to 5000`, `${keyword} 5001–7999`];
  return {
    question,
    options,
    salary: {
      ...bandSalary,
      defaultCurrency: code,
      currencies: [{ code, keywords: [code, keyword], net: 6000 }],
    },
    rules: [bandSavedRule(options[0], { question })],
  };
};
