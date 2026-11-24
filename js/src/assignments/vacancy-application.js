import { modelFingerprint } from '../automation/answer-model-context.js';
import { saveAcknowledgedRecord } from '../storage/acknowledged-record.js';
import { assignmentFailure } from './validation.js';
import { vacancyContent } from './vacancy-content.js';

const persistentDelivery = (record) =>
  !record.options.testMode &&
  record.options.collectVacancies !== false &&
  record.state === 'delivered' &&
  record.delivery === 'provider-confirmed';
/** Inside the application writer, after its delivery journal is acknowledged. */
export const observeVacancyApplication = async (
  store,
  record,
  now = Date.now
) => {
  const page = record.page;
  if (
    !persistentDelivery(record) ||
    !page?.bound ||
    !page.delivered ||
    page.challenge ||
    page.dailyLimit ||
    page.external
  ) {
    return;
  }
  const id = `assignment-vacancy:${await modelFingerprint(record.url)}`;
  const before = await store.get(id);
  // A receipt alone is not a successfully collected full description.
  if (!before) {
    return;
  }
  if (before.id !== id || before.version !== 1) {
    throw assignmentFailure(
      'vacancy-invalid',
      'Invalid saved vacancy identity.'
    );
  }
  const content = vacancyContent(before, record.url);
  if (content.status === 'applied') {
    return;
  }
  const next = {
    ...before,
    status: 'applied',
    appliedAt: new Date(now()).toISOString(),
  };
  vacancyContent(next, record.url);
  // Keep capture/observation times and exact private markup unchanged.
  await saveAcknowledgedRecord(store, next);
};
