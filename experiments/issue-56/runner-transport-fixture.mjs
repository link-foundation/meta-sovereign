import { EventEmitter } from 'node:events';

/** Finite event/clock model: no subprocess, network, sleep or real timer. */
export const transportFixture = () => {
  const child = new EventEmitter();
  child.stdin = new EventEmitter();
  child.stdin.end = () => {};
  const signals = [];
  child.kill = (signal) => {
    signals.push(signal);
    return true;
  };
  const timers = new Map();
  let now = 0;
  let serial = 0;
  let callback;
  let invocation;
  const clock = {
    setTimeout(fn, delay) {
      const id = ++serial;
      timers.set(id, { at: now + delay, fn });
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
  };
  return {
    child,
    clock,
    signals,
    get pendingTimers() {
      return timers.size;
    },
    get invocation() {
      return invocation;
    },
    exec(file, args, options, done) {
      callback = done;
      invocation = { file, args, options };
      // Model execFile's original AbortSignal behavior: callback first,
      // SIGTERM issued, but a stubborn child has not closed its resources.
      options.signal?.addEventListener('abort', () => {
        child.kill('SIGTERM');
        done(
          Object.assign(new Error('aborted'), { code: 'ABORT_ERR' }),
          '',
          ''
        );
      });
      return child;
    },
    advance(milliseconds) {
      const end = now + milliseconds;
      for (let step = 0; step < 10; step += 1) {
        const next = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
        if (!next || next[1].at > end) {
          now = end;
          return;
        }
        now = next[1].at;
        timers.delete(next[0]);
        next[1].fn();
      }
      throw new Error('Fixture exceeded its finite timer bound');
    },
    report(error = null, stdout = '', stderr = '') {
      callback(error, stdout, stderr);
    },
    close() {
      child.emit('close');
    },
  };
};
