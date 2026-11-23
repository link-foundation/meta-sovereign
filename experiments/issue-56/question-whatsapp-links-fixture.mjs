import { createWhatsAppCloudLive } from '../../js/src/sources/whatsapp.js';
import { createMemoryStore } from '../../js/src/storage/universal.js';
import { normalizeAutomation } from '../../js/src/automation/automations.js';

export const whatsappChat = '15555550101';
export const whatsappQuestion = 'Do you have relevant experience?';
export const whatsappTarget =
  'https://www.facebook.com/post?revision=One#Review';
export const whatsappChangedTarget = whatsappTarget.replace('One', 'Two');
export const whatsappQuestionRule = {
  id: 'qa-rule:whatsapp-links',
  question: whatsappQuestion,
  answers: [{ text: 'Five years.', approved: true }],
};
export const whatsappQuestionAutomation = normalizeAutomation({
  id: 'automation:whatsapp-links',
  name: 'WhatsApp destination review',
  mode: 'auto',
  action: { kind: 'answer-questions' },
  conditions: { mutual: false, cooldownDays: 0 },
  pacing: { typing: false },
});

export const whatsappWebhookFixture = (fields = {}) => ({
  object: 'whatsapp_business_account',
  entry: [
    {
      changes: [
        {
          field: 'messages',
          value: {
            metadata: { phone_number_id: 'fixture-business' },
            messages: [
              {
                id: 'wamid.question',
                from: whatsappChat,
                timestamp: '1795305600',
                type: 'text',
                ...(fields.type && fields.type !== 'text'
                  ? {}
                  : { text: { body: whatsappQuestion } }),
                ...fields,
              },
            ],
          },
        },
      ],
    },
  ],
});

export const whatsappQuestionMessage = async (fields) => {
  const { links } = await createWhatsAppCloudLive().pullMessages({
    webhookPayload: whatsappWebhookFixture(fields),
  });
  return links[0];
};

export const whatsappReferralQuestion = (url = whatsappTarget) =>
  whatsappQuestionMessage({
    referral: {
      source_type: 'post',
      source_url: url,
      image_url: 'https://example.test/transient-preview.jpg',
    },
  });

export const seedWhatsappQuestionLinks = async () => {
  const store = createMemoryStore();
  await store.putMany([
    whatsappQuestionRule,
    whatsappQuestionAutomation,
    await whatsappReferralQuestion(),
  ]);
  return store;
};
