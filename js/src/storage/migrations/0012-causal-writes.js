export const id = '0012-causal-writes';
export const from = 11;
export const to = 12;
export const description =
  'Require compatible peers that assign ordinary writes causal clocks at storage admission.';

// Keep historical records as observed. Writable openings install the policy
// only after migration; inventing clocks for old snapshots would promote them.
export const up = async () => {};
