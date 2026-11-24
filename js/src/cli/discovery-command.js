/** Foreground ownership lasts through collection; signals stop and drain its lane. */
export const foregroundVacancyDiscovery = async (service, input, log) => {
  let cancelling;
  const stop = () => {
    cancelling ??= service['discovery-stop'](input);
    cancelling.catch(() => {});
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  try {
    log(await service['discovery-start']({ ...input, confirm: true }));
    await service['discovery-drain']();
    await cancelling;
    return service['discovery-status'](input);
  } finally {
    process.off('SIGINT', stop);
    process.off('SIGTERM', stop);
    await cancelling;
  }
};
