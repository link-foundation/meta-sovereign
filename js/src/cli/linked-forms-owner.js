import { createFormReader } from '../forms/reader.js';
import { createFormReportWriter } from '../forms/report-file.js';
import { createLinkedFormPrefill } from '../forms/linked-prefill.js';
import { encodeWire } from '../transport/lino.js';

export const ownLinkedForms = (store, log, options) => {
  const forms = createFormReader({
    store,
    reportWriter: createFormReportWriter(),
    ...options,
  });
  return {
    prefill: createLinkedFormPrefill({
      store,
      forms,
      onWaiting: ({ reviewSession }) =>
        log(
          encodeWire({
            event: 'question-form-waiting-owner',
            url: reviewSession.url,
            browserSlot: reviewSession.browserSlot,
          })
        ),
    }),
    detach: forms.detachReviews,
  };
};
