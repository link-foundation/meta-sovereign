// Old browser extraction retained direction without the native status evidence.
// Re-reading an actual sent/delivered/read icon can replace this unknown state.
export const id = '0021-hh-browser-delivery';
export const from = 20;
export const to = 21;
export const description =
  'Mark legacy outgoing HH browser delivery unknown until observed again.';

export const up = async (ctx) => {
  await ctx.scan({ prefix: 'msg:hh:' }, async (batch) => {
    await ctx.putMany(
      batch
        .filter(
          (link) =>
            link.source === 'hh' &&
            link.via === 'browser' &&
            link.outgoing === true &&
            (link.delivery === null || link.delivery === undefined)
        )
        .map((link) => ({ ...link, delivery: 'unknown' }))
    );
  });
};
