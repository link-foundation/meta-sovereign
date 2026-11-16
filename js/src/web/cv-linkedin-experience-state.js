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

class LinkedinExperienceState {
  constructor(api, changed, options) {
    this.api = api;
    this.changed = changed;
    this.schedule =
      options.schedule ?? ((fn, ms) => globalThis.setTimeout(fn, ms));
    this.cancel = options.cancel ?? ((id) => globalThis.clearTimeout(id));
    this.uuid = options.uuid ?? (() => globalThis.crypto.randomUUID());
    this.download = options.download ?? downloadLinkedinEvidence;
    this.live = true;
    this.sequence = 0;
    this.failures = 0;
    this.state = {
      url: '',
      language: 'en',
      requestId: this.uuid(),
      attempted: false,
      row: null,
      busy: false,
      unknown: false,
      error: false,
    };
  }
  update(patch) {
    this.state = { ...this.state, ...patch };
    if (this.live) {
      this.changed(this.state);
    }
  }
  clearTimer() {
    this.cancel(this.timer);
    this.timer = null;
  }
  poll() {
    this.clearTimer();
    if (
      this.live &&
      !this.state.busy &&
      this.failures < 10 &&
      (running(this.state.row) || this.state.unknown)
    ) {
      this.timer = this.schedule(
        () => this.refresh(),
        Math.min(30000, 1000 * 2 ** this.failures)
      );
    }
  }
  async refresh() {
    if (!this.live || this.state.busy) {
      return false;
    }
    this.clearTimer();
    const sequence = ++this.sequence;
    const requestId = this.state.requestId;
    try {
      const row = checked(
        await this.api.cvLinkedinExperienceStatus({ requestId }),
        requestId
      );
      if (!this.live || sequence !== this.sequence) {
        return false;
      }
      this.failures = 0;
      this.update({
        row,
        attempted: true,
        unknown: false,
        error: false,
        ...(this.state.url === '' && row.options
          ? { url: row.options.url, language: row.options.language }
          : {}),
      });
      return true;
    } catch {
      if (this.live && sequence === this.sequence) {
        this.failures++;
        this.update({ unknown: true, error: true });
      }
      return false;
    } finally {
      if (sequence === this.sequence) {
        this.poll();
      }
    }
  }
  async mutate(operation) {
    if (
      !this.live ||
      this.state.busy ||
      (operation === 'Start' && this.state.attempted)
    ) {
      return false;
    }
    this.clearTimer();
    ++this.sequence;
    const { requestId, url, language } = this.state;
    this.update({ busy: true, attempted: true, error: false });
    try {
      const row = checked(
        await this.api[`cvLinkedinExperience${operation}`](
          operation === 'Start' ? { requestId, url, language } : { requestId }
        ),
        requestId
      );
      this.failures = 0;
      this.update({ row, unknown: false });
      return true;
    } catch {
      this.update({ unknown: true, error: true });
      return false;
    } finally {
      this.update({ busy: false });
      this.poll();
    }
  }
  input(name, value) {
    if (
      !this.state.busy &&
      !this.state.attempted &&
      ['url', 'language', 'requestId'].includes(name)
    ) {
      ++this.sequence;
      this.clearTimer();
      this.update({ [name]: value, row: null, unknown: false });
    }
  }
  newRequest() {
    if (!this.state.busy && !running(this.state.row) && !this.state.unknown) {
      ++this.sequence;
      this.clearTimer();
      this.update({
        requestId: this.uuid(),
        row: null,
        attempted: false,
        error: false,
      });
    }
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
  dispose() {
    this.live = false;
    ++this.sequence;
    this.clearTimer();
  }
}
export const createLinkedinExperienceState = (api, changed, options = {}) => {
  const controller = new LinkedinExperienceState(api, changed, options);
  changed(controller.state);
  return controller;
};
