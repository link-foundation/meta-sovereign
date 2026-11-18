// Existing snapshots stay explicit: migration never opts an owner into fetching.
export const id = '0009-salary-exchange-policy';
export const from = 8;
export const to = 9;
export const description =
  'Keep existing salary automations on saved exchange snapshots.';

export const up = async (ctx) => {
  await ctx.scan({ prefix: 'automation:' }, async (batch) => {
    for (const link of batch) {
      const salary = link.action?.salary;
      if (
        link.action?.kind === 'answer-questions' &&
        salary &&
        salary.exchangeMode === undefined
      ) {
        await ctx.put({
          ...link,
          action: {
            ...link.action,
            salary: { ...salary, exchangeMode: 'snapshot' },
          },
        });
      }
    }
  });
};
