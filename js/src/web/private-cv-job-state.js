export class PrivateCvJobState {
  constructor(api, changed, options) {
    this.api = api;
    this.options = options;
    this.running = options.running;
    this.changed = changed;
    this.schedule =
      options.schedule ?? ((fn, ms) => globalThis.setTimeout(fn, ms));
    this.cancel = options.cancel ?? ((id) => globalThis.clearTimeout(id));
    this.uuid = options.uuid ?? (() => globalThis.crypto.randomUUID());
    this.live = true;
    this.sequence = 0;
    this.failures = 0;
    this.state = {
      ...options.initial,
      requestId: this.remembered() || this.uuid(),
      attempted: !!this.remembered(),
      row: null,
      busy: false,
      unknown: !!this.remembered(),
      error: false,
    };
  }
  remembered() {
    try {
      return this.options.pendingKey
        ? (globalThis.localStorage?.getItem(this.options.pendingKey) ?? '')
        : '';
    } catch {
      return '';
    }
  }
  remember(id) {
    if (this.options.pendingKey) {
      try {
        if (id) {
          globalThis.localStorage?.setItem(this.options.pendingKey, id);
        } else {
          globalThis.localStorage?.removeItem(this.options.pendingKey);
        }
      } catch {
        /* Recovery by explicit request ID remains available. */
      }
    }
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
      (this.running(this.state.row) || this.state.unknown)
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
    this.remember(requestId);
    try {
      const row = await this.options.checked(
        await this.api[`${this.options.prefix}Status`]({ requestId }),
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
        ...this.options.adopt?.(this.state, row),
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
  async mutate(operation, extra = {}) {
    if (
      !this.live ||
      this.state.busy ||
      (operation === 'Start' && this.state.attempted)
    ) {
      return false;
    }
    this.clearTimer();
    ++this.sequence;
    const { requestId } = this.state;
    const input = Object.fromEntries(
      this.options.fields.map((field) => [field, this.state[field]])
    );
    this.remember(requestId);
    this.update({ busy: true, attempted: true, error: false });
    try {
      const row = await this.options.checked(
        await this.api[`${this.options.prefix}${operation}`](
          operation === 'Start'
            ? { ...input, ...extra, requestId }
            : { ...extra, requestId }
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
      [...this.options.fields, 'requestId'].includes(name)
    ) {
      ++this.sequence;
      this.clearTimer();
      this.update({ [name]: value, row: null, unknown: false });
    }
  }
  newRequest() {
    if (
      !this.state.busy &&
      !this.running(this.state.row) &&
      !this.state.unknown
    ) {
      ++this.sequence;
      this.clearTimer();
      this.remember(null);
      this.update({
        requestId: this.uuid(),
        row: null,
        attempted: false,
        error: false,
      });
    }
  }
  dispose() {
    this.live = false;
    ++this.sequence;
    this.clearTimer();
  }
}
