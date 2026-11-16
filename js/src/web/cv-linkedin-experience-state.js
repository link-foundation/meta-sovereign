import { PrivateCvJobState } from './private-cv-job-state.js';

const running = (row) =>
  ['opening', 'waiting-login', 'reading'].includes(row?.phase);
const checked = (row, requestId) => {
  if (
    row?.requestId !== requestId ||
    ![
      'opening',
      'waiting-login',
      'reading',
      'completed',
      'stopped',
      'failed',
      'interrupted',
    ].includes(row.phase) ||
    (row.phase === 'completed' && !/^[a-f0-9]{64}$/u.test(row.revision))
  ) {
    throw new Error('The LinkedIn export state was not acknowledged.');
  }
  return row;
};
export const downloadLinkedinEvidence = ({ name, text }) => {
  const href = URL.createObjectURL(
    new globalThis.Blob([text], { type: 'text/plain;charset=utf-8' })
  );
  const anchor = globalThis.document.createElement('a');
  anchor.href = href;
  anchor.download = name;
  anchor.click();
  globalThis.setTimeout(() => URL.revokeObjectURL(href), 1000);
};

class LinkedinExperienceState extends PrivateCvJobState {
  constructor(api, changed, options) {
    super(api, changed, {
      initial: { url: '', language: 'en' },
      fields: ['url', 'language'],
      prefix: 'cvLinkedinExperience',
      checked,
      running,
      adopt: (state, row) =>
        state.url === '' && row.options
          ? { url: row.options.url, language: row.options.language }
          : {},
      ...options,
    });
    this.download = options.download ?? downloadLinkedinEvidence;
  }
  async evidence(name) {
    const { row, requestId } = this.state;
    if (!this.live || row?.phase !== 'completed') {
      return false;
    }
    try {
      const file = await this.api.cvLinkedinExperienceEvidence({
        requestId,
        name,
      });
      if (file.name !== name || typeof file.text !== 'string') {
        throw new Error('The export evidence was not confirmed.');
      }
      if (this.live && this.state.requestId === requestId) {
        this.download(file);
      }
      return true;
    } catch {
      this.update({ error: true });
      return false;
    }
  }
}
export const createLinkedinExperienceState = (api, changed, options = {}) => {
  const controller = new LinkedinExperienceState(api, changed, options);
  changed(controller.state);
  return controller;
};
