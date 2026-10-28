import { parse } from 'yaml';

export function workflowPolicyErrors(text) {
  const flow = parse(text);
  const errors = [];
  if (!flow || typeof flow !== 'object' || !flow.jobs) {
    return ['Workflow must define jobs'];
  }
  if (flow.permissions?.contents !== 'read') {
    errors.push('Default contents permission must be read');
  }
  for (const [name, job] of Object.entries(flow.jobs)) {
    errors.push(...jobPolicyErrors(name, job));
  }
  return errors;
}

function jobPolicyErrors(name, job) {
  const errors = [];
  // Reusable-workflow jobs cannot set runs-on, timeout or steps.
  if (job.uses) {
    return errors;
  }
  if (!(
    Number.isFinite(job['timeout-minutes']) && job['timeout-minutes'] > 0
  )) {
    errors.push(`${name}: require a finite positive timeout`);
  }
  const runners = JSON.stringify([job['runs-on'], job.strategy?.matrix]);
  if (/\b(?:ubuntu|windows|macos)-latest\b/.test(runners)) {
    errors.push(`${name}: pin hosted runner images, including matrix entries`);
  }
  for (const step of job.steps || []) {
    if (
      step.uses?.startsWith('actions/checkout@') &&
      step.with?.['persist-credentials'] !== false
    ) {
      errors.push(`${name}: checkout credentials must not persist`);
    }
  }
  return errors;
}
