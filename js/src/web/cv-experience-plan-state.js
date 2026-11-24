import { PrivateCvJobState } from './private-cv-job-state.js';
import { experiencePlanRunning } from '../cv/experience-plan-record.js';
import { confirmedExperiencePlan } from '../cv/experience-plan-receipt.js';
import { encodeLinoValue, LINO_TEXT, LINO_BINARY } from '../transport/lino.js';

export const downloadExperiencePlan = (row, type = LINO_TEXT) => {
  const href = URL.createObjectURL(
    new globalThis.Blob([encodeLinoValue(row, type)], { type })
  );
  const anchor = globalThis.document.createElement('a');
  anchor.href = href;
  anchor.download = `experience-plan-${row.requestId}.${type === LINO_BINARY ? 'bin' : 'lino'}`;
  anchor.click();
  globalThis.setTimeout(() => URL.revokeObjectURL(href), 1000);
};
export const createExperiencePlanState = (api, changed, options = {}) => {
  const state = new PrivateCvJobState(api, changed, {
    initial: { to: 'linkedin' },
    fields: ['to'],
    prefix: 'cvExperiencePlan',
    pendingKey: 'meta-sovereign:experience-plan',
    checked: confirmedExperiencePlan,
    running: experiencePlanRunning,
    ...options,
  });
  state.openComparison = async ({ plan, hh, linkedin }) => {
    if (
      !state.live ||
      state.state.busy ||
      state.state.unknown ||
      state.running(state.state.row)
    ) {
      return false;
    }
    ++state.sequence;
    state.clearTimer();
    state.update({ busy: true });
    try {
      const { requestId, fingerprint } = plan;
      const row = await confirmedExperiencePlan(
        await api.cvExperiencePlanStatus({ requestId }),
        requestId
      );
      if (
        !state.live ||
        row.phase !== 'completed' ||
        row.fingerprint !== fingerprint ||
        row.options.hh !== hh ||
        row.options.linkedin !== linkedin
      ) {
        return false;
      }
      state.remember(requestId);
      state.update({
        requestId,
        row,
        to: row.options.to,
        attempted: true,
        error: false,
      });
      return true;
    } catch {
      return false;
    } finally {
      state.update({ busy: false });
    }
  };
  changed(state.state);
  return state;
};
