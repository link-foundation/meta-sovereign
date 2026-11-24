import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

/** Share the same real collection controls and screenshot targeting. */
export const vacancySnapshotShot =
  (page, snapshot, directory) => async (name) => {
    if (directory) {
      await mkdir(directory, { recursive: true });
      await snapshot.scrollIntoViewIfNeeded();
      await page.screenshot({ path: join(directory, `${name}.png`) });
    }
  };

export const collectFirstVacancy = async (fixture) => {
  const { page } = fixture;
  const panel = page.locator('[data-vacancies]');
  await page.goto(`${fixture.base}/#/cv`);
  await panel.locator('[data-vacancy-field="query"]').fill('Python');
  await panel.locator('[data-vacancy-action="search"]').click();
  await panel.locator('[data-vacancy-card]').first().waitFor();
  await panel.locator('[data-vacancy-action="collect"]').first().click();
  await panel.locator('[data-vacancy-snapshot]').waitFor();
};
