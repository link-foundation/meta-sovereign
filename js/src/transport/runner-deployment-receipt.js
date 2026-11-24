const digest = /^[a-f0-9]{64}$/u;
const tag = /^v\d{1,10}\.\d{1,10}\.\d{1,10}(?:-[a-z\d][a-z\d.-]{0,39})?$/u;
const refusals = new Set([
  'runner-source-unconfigured',
  'runner-source-plan-changed',
  'runner-source-unconfirmed',
]);
const isDigest = (value) => typeof value === 'string' && digest.test(value);
const isTag = (value) => typeof value === 'string' && tag.test(value);

export const runnerDeploymentAction = (action) =>
  action === 'deploy-plan' || action === 'deploy';

export const runnerSourcePin = (value) => {
  if (typeof value !== 'string') {
    return null;
  }
  const [release, sha256, remainder] = value.split('@');
  return remainder === undefined && isTag(release) && isDigest(sha256)
    ? { release, sha256 }
    : null;
};

export const runnerSourceAsset = 'meta-sovereign-runner-source.tar.gz';

export const runnerSourceUrl = (release) =>
  `https://github.com/link-foundation/meta-sovereign/releases/download/${release}/${runnerSourceAsset}`;

const bounded = (value) =>
  typeof value === 'string' && value.length > 0 && value.length <= 2048;

const validPlan = (value, mode) =>
  value.ok === true &&
  value.mode === mode &&
  bounded(value.host) &&
  bounded(value.directory) &&
  isTag(value.release) &&
  isDigest(value.sha256) &&
  isDigest(value.applicationLock) &&
  isDigest(value.revision) &&
  value.source === runnerSourceUrl(value.release);

export const runnerDeploymentReceipt = (value, action, mode) => {
  if (value?.ok === false && refusals.has(value.code)) {
    return { ok: false, code: value.code };
  }
  if (
    !value ||
    !validPlan(value, mode) ||
    (action === 'deploy-plan'
      ? value.state !== undefined
      : !['prepared', 'present'].includes(value.state))
  ) {
    throw new Error('Runner source preparation was not confirmed.');
  }
  const {
    host,
    directory,
    release,
    sha256,
    applicationLock,
    revision,
    source,
    state,
  } = value;
  return {
    ok: true,
    mode,
    host,
    directory,
    release,
    sha256,
    applicationLock,
    revision,
    source,
    ...(state === undefined ? {} : { state }),
  };
};
