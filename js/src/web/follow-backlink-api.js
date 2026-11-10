import {
  backlinkJobReceipt as job,
  backlinkConfigReceipt as config,
  backlinkRowsReceipt as rows,
} from './follow-backlink-receipt.js';
const preview = (value) =>
  value?.ok === true &&
  typeof value.planId === 'string' &&
  /^[a-f\d-]{36}$/u.test(value.planId) &&
  Number.isFinite(value.expiresAt) &&
  typeof value.owner === 'string' &&
  config(value.config) &&
  rows(value.rows) &&
  value.rows.every((row) => row.status === 'ready');
const page = (value) =>
  Array.isArray(value?.jobs) &&
  value.jobs.length <= 100 &&
  value.jobs.every(job) &&
  Number.isSafeInteger(value.total) &&
  value.total >= value.jobs.length &&
  (value.nextOffset === null ||
    (Number.isSafeInteger(value.nextOffset) && value.nextOffset > 0));
const valid = (action, value, input) => {
  if (value?.ok === false && typeof value.code === 'string') {
    return true;
  }
  if (action === 'preview') {
    return preview(value);
  }
  if (action === 'cancel') {
    return value?.ok === true;
  }
  if (action === 'list') {
    return page(value);
  }
  return job(value) && (action === 'apply' || value.id === input.jobId);
};
const failure = (code) => Object.assign(new Error(code), { code });
export const followBacklinkApi = ({ remote }) => {
  const request = async (action, input = {}) => {
    const read = action === 'list' || action === 'status';
    const suffix = action === 'list' ? '' : `/${action}`;
    const path = `/api/automations/follow/backlinks${suffix}${read ? `?${new URLSearchParams(input)}` : ''}`;
    let value;
    if (remote.request) {
      const response = await remote.request(
        path,
        read
          ? undefined
          : {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(input),
            },
        { network: true }
      );
      if (!response) {
        throw failure('follow-server-required');
      }
      value = await response.json().catch(() => null);
    } else {
      value = read
        ? await remote.get(path)
        : await (remote.report ?? remote.post)(path, input, { network: true });
    }
    if (!valid(action, value, input)) {
      throw failure(
        read || action === 'preview' ? 'read-failed' : 'outcome-unknown'
      );
    }
    if (value.ok === false) {
      throw Object.assign(
        failure(value.code),
        Number.isSafeInteger(value.providerCode)
          ? { providerCode: value.providerCode }
          : {}
      );
    }
    return value;
  };
  return {
    followBacklinkPreview: (input) => request('preview', input),
    followBacklinkApply: (input) => request('apply', input),
    followBacklinkList: (input) => request('list', input),
    followBacklinkStatus: (input) => request('status', input),
    followBacklinkResume: (input) => request('resume', input),
    followBacklinkCancel: (input) => request('cancel', input),
  };
};
