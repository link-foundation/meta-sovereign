import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runnerProfileData } from '../cli/runner-profile.js';
import {
  runnerSourcePin,
  runnerSourceUrl,
} from '../transport/runner-deployment-receipt.js';
import { createRunnerRuntimePreparation } from './runner-node.js';
import { createRunnerTransport } from './runner-transport.js';

const refusal = (code) => ({ ok: false, code });
const installSource = createRunnerTransport({ deadlineMs: 100000 });

/** Review the exact source, destination and lock from the effective profile. */
export const runnerDeploymentPlan = (target, mode) => {
  const pin = runnerSourcePin(target?.applicationSource);
  if (!pin || !target.applicationLock) {
    return refusal('runner-source-unconfigured');
  }
  const profile = runnerProfileData({ [mode]: target });
  const revision = createHash('sha256')
    .update(JSON.stringify({ mode, profile }))
    .digest('hex');
  return {
    ok: true,
    mode,
    ...pin,
    host: target.host ?? 'local',
    directory: target.directory,
    applicationLock: target.applicationLock,
    source: runnerSourceUrl(pin.release),
    revision,
  };
};

const hostTarget = (target) => ({
  ...target,
  isolation: 'screen',
  directory: (target.host ? path.posix : path).dirname(target.directory),
  node: target.isolation === 'docker' ? 'node' : target.node,
});

export const createRunnerSourcePreparation =
  ({
    install = installSource,
    resolveRuntime = createRunnerRuntimePreparation(),
  } = {}) =>
  async (target, plan, { signal } = {}) => {
    const refused = refusal('runner-source-unconfirmed');
    try {
      const host = hostTarget(target);
      const runtime = await resolveRuntime(host, {
        signal,
        installMissing: true,
      });
      if (!runtime || signal?.aborted) {
        return refused;
      }
      const program = await readFile(
        new URL('./runner-tools/deploy-source.mjs', import.meta.url),
        'utf8'
      );
      const result = await install(
        host,
        [
          runtime.node,
          '--input-type=module',
          '--eval',
          program,
          plan.directory,
          plan.release,
          plan.applicationLock,
          plan.sha256,
          plan.source,
        ],
        { signal }
      );
      return result.code === 0 &&
        !result.aborted &&
        !result.stderr?.trim() &&
        ['prepared', 'present'].includes(result.stdout)
        ? { ...plan, state: result.stdout }
        : refused;
    } catch {
      return refused;
    }
  };

/** Stale approvals cannot prepare a different address, archive or lock. */
export const runRunnerDeployment = async (read, request, prepare) => {
  const target = (await read()).targets[request.mode];
  const plan = runnerDeploymentPlan(target, request.mode);
  if (request.action === 'deploy-plan' || !plan.ok) {
    return plan;
  }
  if (plan.revision !== request.revision) {
    return refusal('runner-source-plan-changed');
  }
  request.signal?.throwIfAborted();
  return prepare(target, plan, { signal: request.signal });
};
