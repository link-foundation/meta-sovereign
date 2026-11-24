import {
  applicationBatchFixture,
  batchUrls,
} from './application-batch-fixture.mjs';

export const batchAttachmentText = 'Reviewed separate cover letter';

export const batchAttachmentFixture = (
  t,
  { uncertain = null, recruiterPanelOpen = false } = {}
) => {
  const effects = [];
  const fixture = applicationBatchFixture(t, {
    vacancyPage: (state, url) => {
      if (url === batchUrls[0]) {
        Object.assign(state.page, {
          enter: null,
          delivered: true,
          ...(recruiterPanelOpen ? { recruiterPanelOpen } : {}),
          attachment: {
            offer: { disabled: false },
            value: null,
            submit: null,
          },
        });
      }
    },
    application: {
      dispatch: async (_handle, _record, action) => {
        effects.push(action);
        if (action === 'attachmentOpen') {
          fixture.state.page.attachment = {
            offer: null,
            value: '',
            submit: { disabled: false },
          };
        } else if (action === 'attachmentSend') {
          if (uncertain === 'lost') {
            throw new Error('Synthetic lost attachment receipt');
          }
          if (uncertain === 'navigation') {
            fixture.state.page.documentKey = 'attachment-moved-after-dispatch';
          } else {
            fixture.state.page.attachment = {
              offer: null,
              value: null,
              submit: null,
            };
          }
        }
        return { dispatched: true };
      },
      writeLetter: async (_browser, text) => {
        fixture.state.page.attachment.value = text;
        return 'verified';
      },
    },
  });
  return { ...fixture, effects };
};
