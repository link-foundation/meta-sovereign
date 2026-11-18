import { decodeWire, LINO_TEXT } from '../transport/lino.js';
import { runnerHealthReceipt } from '../transport/runner-health-receipt.js';
import { setTimeout, clearTimeout } from 'node:timers';
import { runRunnerCommand } from './runner-transport.js';
import { dockerRunnerInspection } from './runner-docker.js';

/** Execute the configured application's read-only health command on its host. */
export const inspectRunnerApplication = async (target, run, options = {}) => {
  if (!target || options.signal?.aborted) {
    return 'unknown';
  }
  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(), 10000);
  const signal = options.signal
    ? globalThis.AbortSignal.any([options.signal, deadline.signal])
    : deadline.signal;
  try {
    const prefix =
      target.isolation === 'docker'
        ? await dockerRunnerInspection(target, run, { ...options, signal })
        : [];
    if (!prefix) {
      return 'unknown';
    }
    const result = await run(
      target,
      [
        ...prefix,
        target.node ?? 'node',
        '--',
        target.cli,
        'runner',
        'health',
        `--store=${target.store}`,
      ],
      { ...options, signal }
    );
    if (
      signal.aborted ||
      result.aborted ||
      result.code !== 0 ||
      result.stderr?.trim()
    ) {
      return 'unknown';
    }
    const value = runnerHealthReceipt(decodeWire(result.stdout, LINO_TEXT));
    return value.state;
  } catch {
    return 'unknown';
  } finally {
    clearTimeout(timer);
  }
};

export const readRunnerInspection = async ({
  control,
  targets,
  mode,
  run = runRunnerCommand,
  signal,
  code,
}) => {
  const current = await control.status({ signal });
  const session = current.states[mode];
  const state = ['stopped', 'unconfigured'].includes(session)
    ? session
    : await inspectRunnerApplication(targets[mode], run, { signal });
  const refusal =
    code ??
    (state === 'unknown' ? 'runner-application-unconfirmed' : undefined);
  return {
    ...current,
    ok: state !== 'unknown',
    scope: 'isolated-session',
    application: { mode, state },
    ...(refusal ? { code: refusal } : {}),
  };
};
