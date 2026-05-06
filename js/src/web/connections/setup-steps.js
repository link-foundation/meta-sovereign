// Per-provider step-by-step setup sequences (issue #25 R-N8).
//
// Every provider declares at least three steps:
//   1. Where to obtain the credential / archive (titleKey / bodyKey).
//   2. How to enter it inside the SPA (titleKey / bodyKey).
//   3. How to verify the connection succeeded (titleKey / bodyKey).
//
// The translation keys live in `js/src/web/locales/*.js`; the
// providerCatalogue.docsUrl supplies the deep link rendered as
// `actionKey + href`. ConnectionDetail walks this list and renders one
// `<li>` per step inside the dedicated provider screen.

const PROVIDER_IDS = [
  'email',
  'telegram',
  'vk',
  'x',
  'whatsapp',
  'facebook',
  'linkedin',
  'habr-career',
  'hh',
  'github',
  'upwork',
  'peopleperhour',
  'superjob',
];

const buildSteps = (id) => [
  {
    id: 'obtain',
    titleKey: `connections.${id}.setup.step1.title`,
    bodyKey: `connections.${id}.setup.step1.body`,
  },
  {
    id: 'enter',
    titleKey: `connections.${id}.setup.step2.title`,
    bodyKey: `connections.${id}.setup.step2.body`,
  },
  {
    id: 'verify',
    titleKey: `connections.${id}.setup.step3.title`,
    bodyKey: `connections.${id}.setup.step3.body`,
  },
];

export const providerSetupSteps = Object.fromEntries(
  PROVIDER_IDS.map((id) => [id, buildSteps(id)])
);
