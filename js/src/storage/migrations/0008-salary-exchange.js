// R-AA1 / R-Z17: introduce an empty cache without claiming a fetched rate.
import { SALARY_EXCHANGE_ID } from '../../automation/salary-exchange-state.js';

export const id = '0008-salary-exchange';
export const from = 7;
export const to = 8;
export const description =
  'Introduce a dated salary exchange cache without network requests.';

export const up = async (ctx) => {
  if (!(await ctx.get(SALARY_EXCHANGE_ID))) {
    await ctx.put({ id: SALARY_EXCHANGE_ID, exchange: null, fetchedAt: null });
  }
};
