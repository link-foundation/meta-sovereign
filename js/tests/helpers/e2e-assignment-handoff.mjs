import { assert } from './e2e-chat.mjs';
import { closeFormReview, openFormPlan } from './e2e-form-review.mjs';

const captureHandoff = async (page, card, state) => {
  const status = card.locator('[data-form-assignment-state]');
  for (const [layout, width, height] of [
    ['desktop', 1200, 800],
    ['mobile', 390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await page.waitForFunction(
      (width) => globalThis.innerWidth === width,
      width
    );
    await status.evaluate(async (node) => {
      const nextFrame = () =>
        new Promise((resolve) => globalThis.requestAnimationFrame(resolve));
      await nextFrame();
      await nextFrame();
      node.scrollIntoView({ block: 'center', behavior: 'instant' });
      await nextFrame();
    });
    const inView = await status.evaluate((node) => {
      const bounds = node.getBoundingClientRect();
      return bounds.top >= 56 && bounds.bottom < globalThis.innerHeight - 64;
    });
    assert(inView, `${layout} assignment status clears fixed navigation`);
    await page.screenshot({
      path: `docs/screenshots/issue-56-assignment-handoff-${state}-${layout}.png`,
      animations: 'disabled',
    });
  }
  await page.setViewportSize({ width: 1200, height: 800 });
};

export const verifyAssignmentHandoff = async ({
  page,
  url,
  until,
  recovered,
  publication,
}) => {
  const calls = publication.state.calls.length;
  await closeFormReview(page, until, 'close verified review before reopening');
  await page.reload();
  const planned = await openFormPlan(page, url, 'qa-profile:forms-fixture');
  const card = page.locator('[data-form-assignment]');
  const issue = card.getByRole('link', {
    name: 'Assignment issue #1',
    exact: true,
  });
  if (process.env.ASSIGNMENT_HANDOFF_BEFORE === '1') {
    await card.getByRole('link', { name: recovered.repository.url }).waitFor();
    await captureHandoff(page, card, 'before');
  }
  assert(
    planned.planning.assignment.issue?.url === recovered.issue.url,
    'reopened plan carries the exact confirmed issue'
  );
  assert(
    (await issue.getAttribute('href')) === recovered.issue.url,
    'reopened review links to the confirmed issue'
  );
  await issue.waitFor();
  await card
    .getByText(/Complete and review the assignment before submitting/)
    .waitFor();
  assert(
    publication.state.calls.length === calls,
    'reopening performs no GitHub calls'
  );
  if (process.env.ASSIGNMENT_HANDOFF_SCREENSHOTS === '1') {
    await captureHandoff(page, card, 'after');
  }
  await closeFormReview(page, until, 'reopened publication review closed');
  console.log(
    '[assignment-handoff] confirmed issue restored with zero GitHub calls'
  );
};
