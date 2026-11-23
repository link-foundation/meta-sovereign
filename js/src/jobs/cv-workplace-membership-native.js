import { cvPrepareFailure } from './cv-prepare-record.js';
import { sameCvMembership } from './cv-workplace-membership.js';

/** Only the reviewed target checkbox changes. Never Save, delete or alter another CV. */
export const prepareCvWorkplaceMembership = async (context, plan) => {
  const { page, guard, expected, wait } = context;
  await guard();
  const hash = plan.source.identity.hash;
  const wanted = plan.operation === 'copy';
  const prior = wanted
    ? plan.membership.after.map((row) => ({ ...row, checked: false }))
    : plan.membership.before;
  if (wanted && sameCvMembership(expected.resumes, plan.membership.after)) {
    return;
  }
  if (!sameCvMembership(expected.resumes, prior)) {
    throw cvPrepareFailure('membership');
  }
  const wrapper = page.locator(
    `[data-qa="profile-resumes-list-checkbox-${hash}"]:visible`
  );
  const box = wrapper.locator('input[type="checkbox"]');
  const input = (await wrapper.evaluateAll(
    (nodes) => nodes.length === 1 && nodes[0].matches('input[type="checkbox"]')
  ))
    ? wrapper
    : box;
  if (
    (await input.count()) !== 1 ||
    !(await input.isEnabled()) ||
    (await input.isChecked()) === wanted
  ) {
    throw cvPrepareFailure('membership');
  }
  const controlled = await input.evaluate((node, priorChecked) => {
    const props =
      node[Object.keys(node).find((key) => key.startsWith('__reactProps$'))];
    return (
      !node.readOnly &&
      typeof props?.onChange === 'function' &&
      props.checked === priorChecked
    );
  }, !wanted);
  if (!controlled) {
    throw cvPrepareFailure('hydration');
  }
  await guard();
  await input.setChecked(wanted, { timeout: 10000 });
  const next = expected.resumes.map((row) =>
    row.hash === hash ? { ...row, checked: wanted } : row
  );
  await wait(async () => {
    const state = await context.read();
    await guard({ ...expected, resumes: next }, state);
    return input.evaluate((node, checked) => {
      const props =
        node[Object.keys(node).find((key) => key.startsWith('__reactProps$'))];
      return props?.checked === checked;
    }, wanted);
  });
  expected.resumes = next;
  await guard();
};
