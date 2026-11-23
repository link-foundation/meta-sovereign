const { contextBridge, ipcRenderer } = require('electron');

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
  copyText: (text) =>
    ipcRenderer.invoke('meta-sovereign:clipboard-write', text),
  ownerAttention: {
    configure: (input) =>
      ipcRenderer.invoke('meta-sovereign:owner-attention', 'configure', input),
    acknowledge: (input) =>
      ipcRenderer.invoke(
        'meta-sovereign:owner-attention',
        'acknowledge',
        input
      ),
  },
});
