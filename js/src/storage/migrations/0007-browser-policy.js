// R-AA2 / R-Z17: establish a visible default without changing old records.
import { defaultBrowserPolicy } from '../../browser/policy.js';

export const id = '0007-browser-policy';
export const from = 6;
export const to = 7;
export const description =
  'Introduce portable browser-policy links with a visible default.';

export const up = async (ctx) => {
  const link = defaultBrowserPolicy();
  // Preserve a policy already restored/imported before schema migration.
  if (!(await ctx.get(link.id))) {
    await ctx.put(link);
  }
};
