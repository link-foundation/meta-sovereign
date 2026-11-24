const running = ['opening', 'prepared', 'saving', 'skipping', 'verifying'];
export const linkedinAboutRunning = (row) => running.includes(row?.phase);
export const linkedinAboutTerminal = [
  'saved',
  'skipped',
  'closed',
  'left',
  'failed',
  'unconfirmed',
];

export const confirmedLinkedinAboutJob = (row, input) => {
  const stoppedBeforeStart =
    row?.options === null &&
    row.phase === 'left' &&
    row.code === null &&
    row.save === null &&
    row.canSave === false;
  if (
    row?.requestId !== input.requestId ||
    (!stoppedBeforeStart &&
      !Object.entries(input).every(
        ([key, value]) => row.options?.[key] === value
      )) ||
    ![...running, ...linkedinAboutTerminal, 'interrupted'].includes(
      row.phase
    ) ||
    row.providerSaved !== (row.phase === 'saved') ||
    (row.phase === 'saved' && !/^[a-f0-9]{64}$/u.test(row.save?.sha256))
  ) {
    throw new Error('The LinkedIn About review was not confirmed.');
  }
  return row;
};
