import { cvPrepareFailure } from './cv-prepare-record.js';
import { confirmedCvIndustryIds } from './cv-watch-industries.js';

const unique = async (locator) => {
  if (
    (await locator.count()) !== 1 ||
    !(await locator.isVisible()) ||
    !(await locator.isEnabled())
  ) {
    throw cvPrepareFailure('choice');
  }
  return locator;
};
const choose = async ({ context, trigger, open, key, names }) => {
  const { page, guard, expected, wait } = context;
  await guard();
  await (await unique(trigger)).click({ timeout: 10000 });
  await guard();
  await open?.();
  await guard();
  const options = page.getByRole('option').filter({
    hasText: new RegExp(
      `^(?:${names.map((name) => name.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')).join('|')})$`,
      'iu'
    ),
  });
  await wait(
    async () => (await options.count()) === 1 && (await options.isVisible())
  );
  const option = await unique(options);
  const wanted = (await option.textContent()).trim();
  await guard();
  await option.click({ timeout: 10000 });
  await wait(async () => {
    const state = await context.read();
    await guard({ ...expected, [key]: state.fields[key] }, state);
    return state.fields[key] === wanted;
  });
  expected[key] = wanted;
  await guard();
};
export const chooseCvWorkplaceMonth = async (context, part, date) => {
  const month = Number(date.slice(5)) - 1;
  const names = ['en', 'ru'].map((locale) =>
    new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' }).format(
      new Date(Date.UTC(2020, month, 1))
    )
  );
  await choose({
    context,
    key: `${part}Month`,
    names,
    trigger: context.page.locator(
      `[data-qa="resume-editor-experience-${part}-month-input"] [data-qa="magritte-select-activator"]:visible`
    ),
  });
};
export const chooseCvWorkplaceArea = async (context, entry, locale) => {
  if (!entry) {
    throw cvPrepareFailure('choice');
  }
  const name = entry[locale].name;
  await choose({
    context,
    key: 'area',
    names: [name],
    trigger: context.page.locator(
      '[data-qa="resume-editor-experience-area-input"]:visible'
    ),
    open: async () => {
      const input = context.page.locator(
        'input[role="combobox"][aria-label="City or region"]:visible,input[role="combobox"][aria-label="Город или регион"]:visible'
      );
      await (await unique(input)).fill(name, { timeout: 10000 });
    },
  });
};
const industryTrigger = (page) =>
  page
    .locator('[data-qa="trigger-root"]:visible')
    .filter({ hasText: /field of activity|сфера деятельности/iu });
const toggleIndustry = async (context, dialog, entry, locale, wanted) => {
  const { guard, wait } = context;
  await guard(undefined, undefined, true);
  await (
    await unique(dialog.locator('[data-qa="tree-selector-search-input"]'))
  ).fill(entry[locale].name, { timeout: 10000 });
  const uiId = entry.id.split('.')[1];
  const item = dialog.locator(`[data-qa~="tree-selector-item-text-${uiId}"]`);
  const box = dialog.locator(`input[data-qa~="tree-selector-input-${uiId}"]`);
  await wait(
    async () =>
      (await item.count()) === 1 &&
      (await item.isVisible()) &&
      (await item.textContent()).trim() === entry[locale].name
  );
  if ((await box.count()) !== 1 || !(await box.isEnabled())) {
    throw cvPrepareFailure('choice');
  }
  if ((await box.isChecked()) !== wanted) {
    await guard(undefined, undefined, true);
    await (await unique(item)).click({ timeout: 10000 });
  }
  await wait(async () => (await box.isChecked()) === wanted);
};
/** Picker Save applies only the local industry choice; the workplace Save is untouched. */
export const chooseCvWorkplaceIndustries = async (context, plan, locale) => {
  const { page, guard, wait, expected } = context;
  await guard();
  await (await unique(industryTrigger(page))).click({ timeout: 10000 });
  const dialog = page
    .getByRole('dialog')
    .filter({ has: page.locator('[data-qa="tree-selector-search-input"]') });
  await unique(dialog);
  const wanted = new Set(plan.desired.industryIds);
  for (const entry of plan.metadata.industries) {
    await toggleIndustry(context, dialog, entry, locale, wanted.has(entry.id));
  }
  await guard(undefined, undefined, true);
  const save = dialog.getByRole('button', { name: /^(save|сохранить)$/iu });
  await (await unique(save)).click({ timeout: 10000 });
  await wait(async () => !(await dialog.isVisible()));
  const state = await context.read();
  await guard({ ...expected, industryText: state.fields.industryText }, state);
  const ids = confirmedCvIndustryIds(
    state.fields.industryText,
    plan.metadata.industries.map((entry) => ({
      id: entry.id,
      name: entry[locale].name,
    }))
  );
  if (JSON.stringify(ids) !== JSON.stringify([...wanted].sort())) {
    throw cvPrepareFailure('choice');
  }
  expected.industryText = state.fields.industryText;
  await guard();
};
