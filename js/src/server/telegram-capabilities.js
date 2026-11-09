// Capabilities describe the running backend independently of primary sign-in.
export const NO_TELEGRAM = {
  connected: false,
  kind: null,
  account: null,
  available: false,
  capabilities: { notifySettings: false, accountEvents: false },
};

export const telegramStatusResponse = async (account, ctx) => {
  const status = await account.status();
  const answer = {
    ...status,
    available: true,
    capabilities: {
      notifySettings:
        status.kind === 'user' && typeof account.notifyOverview === 'function',
      accountEvents: Boolean(ctx.telegramExtras),
    },
  };
  // Start the initial sync after a hand-added key or interrupted startup.
  if (status.auto && !status.at && !status.syncing) {
    account.sync({ full: true, reason: 'status' }).catch(() => {});
    answer.syncing = true;
  }
  return answer;
};
