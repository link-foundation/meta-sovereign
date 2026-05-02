const { contextBridge } = require('electron');

const splitCandidates = (value) => {
  if (!value) {
    return [];
  }
  return String(value)
    .split(/[,\s]+/)
    .map((candidate) => candidate.trim())
    .filter((candidate) => /^https?:\/\//.test(candidate));
};

const discoveryCandidates = splitCandidates(
  process.env.META_SOVEREIGN_SERVER_CANDIDATES
);

contextBridge.exposeInMainWorld('metaSovereignShell', {
  platform: 'electron',
  discoveryCandidates,
});
