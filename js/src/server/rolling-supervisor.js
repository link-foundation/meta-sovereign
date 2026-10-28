import { randomBytes } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { spawnWorker } from './worker-client.js';
import { setTimeout, clearTimeout } from 'node:timers';
import { hostedUiUrl, localUiEnabled } from './hosted-ui.js';

export class RollingSupervisor {
  constructor({
    storeDir,
    options,
    port,
    tls,
    target,
    configure = () => {},
    log = () => {},
    standbyMs = 30_000,
  }) {
    Object.assign(this, {
      storeDir,
      options,
      port,
      tls,
      target,
      configure,
      log,
      standbyMs,
    });
    this.current = null;
    this.previous = null;
    this.preparing = null;
    this.workers = new Set();
    this.busy = false;
    this.closed = false;
    this.timer = null;
    this.recovering = null;
  }
  async boot(release, checkpoints, options = this.options) {
    const client = spawnWorker({ entry: release.entry, log: this.log });
    const worker = {
      client,
      release,
      options,
      token: randomBytes(32).toString('hex'),
      get port() {
        return client.port;
      },
    };
    this.workers.add(worker);
    client.onExit((info) => this.exited(worker, info));
    try {
      await client.call('init', {
        storeDir: this.storeDir,
        options,
        checkpoints,
        front: { token: worker.token, port: this.port, tls: this.tls ?? false },
      });
      return worker;
    } catch (error) {
      client.discard();
      throw error;
    }
  }
  exited(worker, info) {
    this.workers.delete(worker);
    if (this.closed || worker !== this.current) {
      return;
    }
    this.log({
      level: 'warn',
      event: 'server_worker_exited',
      pid: worker.client.pid,
      ...info,
    });
    this.target.pause();
    if (!this.busy) {
      this.recover();
    }
  }
  async start(release) {
    this.current = await this.boot(release);
    this.target.publish(this.current);
    return this.status();
  }
  status() {
    return {
      build: this.current?.release.build,
      pid: this.current?.client.pid,
      port: this.port,
      tls: Boolean(this.tls),
      uiUrl: hostedUiUrl(this.options.uiUrl),
      localUi: localUiEnabled(this.options.localUi),
    };
  }
  async retirePrevious() {
    clearTimeout(this.timer);
    const old = this.previous;
    this.previous = null;
    await old?.client.close();
    await this.current?.client.call('cancel');
  }
  async warmAdditional(old, candidate, checkpoints) {
    const latest = await old.client.call('prepare');
    const extra = Object.fromEntries(
      Object.entries(latest).filter(([slot]) => !checkpoints[slot])
    );
    if (Object.keys(extra).length) {
      await candidate.client.call('warm', extra);
      Object.assign(checkpoints, extra);
    }
  }
  validateOptions(changes) {
    if (this.closed) {
      throw new Error('server host is closed');
    }
    if (this.busy) {
      throw Object.assign(
        new Error(
          'another upgrade is preparing; the current server stays active'
        ),
        { code: 'UPGRADE_BUSY' }
      );
    }
    const nextOptions = { ...this.options, ...changes };
    if (Boolean(nextOptions.tls) !== Boolean(this.options.tls)) {
      throw Object.assign(
        new Error(
          'TLS listener settings need a host restart; the current server remains active'
        ),
        { code: 'HOST_CONFIG_RESTART' }
      );
    }
    return nextOptions;
  }
  async upgrade(release, changes = {}) {
    await this.recovering;
    const nextOptions = this.validateOptions(changes);
    if (
      this.current?.release.build === release.build &&
      JSON.stringify(nextOptions) === JSON.stringify(this.options)
    ) {
      return { ...this.status(), reused: true };
    }
    this.busy = true;
    const old = this.current;
    let candidate = null;
    let suspended = false;
    try {
      await this.retirePrevious();
      const checkpoints = await old.client.call('prepare');
      this.log({ event: 'server_upgrade_preparing', build: release.build });
      candidate = await this.boot(release, checkpoints, nextOptions);
      this.preparing = candidate;
      await this.warmAdditional(old, candidate, checkpoints);
      if (this.closed) {
        throw new Error('server host is closing');
      }
      this.target.pause();
      const handoff = await old.client.call('suspend');
      suspended = true;
      await candidate.client.call('activate', handoff);
      await candidate.client.call('prepare'); // hold compaction during the rollback window
      this.current = candidate;
      this.options = nextOptions;
      this.configure(nextOptions);
      this.target.publish(candidate);
      this.previous = old;
      this.timer = setTimeout(
        () =>
          this.retirePrevious().catch((error) =>
            this.log({
              level: 'warn',
              event: 'server_retirement_failed',
              error: error.message,
            })
          ),
        this.standbyMs
      );
      this.timer.unref?.();
      this.log({
        event: 'server_upgrade_ready',
        build: release.build,
        pid: candidate.client.pid,
      });
      return { ...this.status(), upgraded: true };
    } catch (error) {
      await candidate?.client.close().catch(() => candidate.client.discard());
      await this.rollback(old, suspended);
      this.log({
        level: 'warn',
        event: 'server_upgrade_failed',
        code: error.code,
        error: error.message,
      });
      throw error;
    } finally {
      this.preparing = null;
      this.busy = false;
      if (this.current?.client.exited && !this.closed) {
        this.recover();
      }
    }
  }
  async rollback(old, suspended) {
    if (old.client.exited || this.closed) {
      return;
    }
    try {
      if (suspended) {
        await old.client.call('restore');
      }
      await old.client.call('cancel');
      this.current = old;
      this.target.publish(old);
    } catch (error) {
      // Keep its cached state for another restore attempt; never publish a
      // stopped backend merely because its process is still alive.
      this.previous = old;
      this.log({
        level: 'warn',
        event: 'server_rollback_retrying',
        error: error.message,
      });
      this.recover();
    }
  }
  recover() {
    if (this.recovering || this.closed) {
      return this.recovering;
    }
    clearTimeout(this.timer);
    this.recovering = this.recoverLoop().finally(() => {
      this.recovering = null;
    });
    return this.recovering;
  }
  async recoverLoop() {
    let release = this.current.release;
    while (!this.closed) {
      try {
        if (this.previous && !this.previous.client.exited) {
          await this.previous.client.call('restore');
          this.current = this.previous;
          this.previous = null;
        } else {
          this.current = await this.boot(release);
        }
        if (this.closed) {
          await this.current.client.close();
          return;
        }
        this.options = this.current.options;
        this.configure(this.options);
        this.target.publish(this.current);
        this.log({
          event: 'server_worker_recovered',
          pid: this.current.client.pid,
        });
        return;
      } catch (error) {
        if (this.previous) {
          release = this.previous.release;
          await this.previous.client.close().catch(() => {});
          this.previous = null;
        }
        this.log({
          level: 'warn',
          event: 'server_recovery_retrying',
          code: error.code,
        });
        await sleep(1000);
      }
    }
  }
  async close() {
    this.closed = true;
    clearTimeout(this.timer);
    this.target.close();
    await Promise.allSettled(
      [...this.workers].map((worker) => worker.client.close())
    );
  }
}
