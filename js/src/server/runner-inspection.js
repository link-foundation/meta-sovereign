import { decodeWire, LINO_TEXT } from '../transport/lino.js';
import { runnerHealthReceipt } from '../transport/runner-health-receipt.js';
import { setTimeout, clearTimeout } from 'node:timers';
import { runRunnerCommand } from './runner-transport.js';
import { dockerRunnerInspection } from './runner-docker.js';
import { configuredRunnerRuntime } from './runner-node.js';
import { inspectRunnerBackend } from './runner-backend.js';

const confirmed = (result, signal) =>
  !signal.aborted &&
  !result.aborted &&
  result.code === 0 &&
  !result.stderr?.trim();

/** Execute the configured application's read-only health command on its host. */
export const inspectRunnerApplication = async (
  target,
  run,
  { resolveRuntime = configuredRunnerRuntime, ...options } = {}
) => {
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
    const runtime =
      prefix && (await resolveRuntime(target, { ...options, signal }));
    if (!runtime) {
      return 'unknown';
    }
    const result = await run(
      target,
      [
        ...prefix,
        runtime.node,
        '--',
        target.cli,
        'runner',
        'health',
        `--store=${target.store}`,
      ],
      { ...options, signal }
    );
    if (!confirmed(result, signal)) {
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
  resolveRuntime,
  desktopRunner,
  signal,
  code,
}) => {
  const current = await control.status({ signal });
  const session = current.states[mode];
  const target = targets[mode];
  const backend =
    session === 'unknown'
      ? await inspectRunnerBackend(target, run, { signal })
      : undefined;
  const inspect = () =>
    target?.isolation === 'desktop'
      ? (desktopRunner?.inspect(target, { signal }) ?? 'unknown')
      : inspectRunnerApplication(target, run, {
          signal,
          resolveRuntime,
        });
  const state = ['stopped', 'unconfigured'].includes(session)
    ? session
    : await inspect();
  const refusal =
    code ??
    (state === 'unknown' ? 'runner-application-unconfirmed' : undefined);
  return {
    ...current,
    ok: state !== 'unknown',
    scope: 'isolated-session',
    application: { mode, state },
    ...(backend ? { backend } : {}),
    ...(refusal ? { code: refusal } : {}),
  };
};
