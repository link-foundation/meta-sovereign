import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { readFormDocument } from '../../js/src/forms/read-document.js';
import { startFormsFixture } from './forms-reader-fixture.mjs';

const fixture = await startFormsFixture();
let browser;
try {
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.E2E_EXECUTABLE_PATH,
  });
  const page = await browser.newPage();
  await page.goto(fixture.url.replace('/application', '/custom'));
  const before = await page.evaluate(readFormDocument);
  await page.locator('#combo-remote').click();
  const after = await page.evaluate(readFormDocument);
  console.log(
    JSON.stringify({
      beforeExcluded: before.excluded,
      afterExcluded: after.excluded,
      beforeFields: before.fields.length,
      afterFields: after.fields.length,
    })
  );
  assert.equal(
    before.excluded,
    after.excluded,
    'closing an owned popup does not change excluded-field coverage'
  );
  assert.equal(before.fields.length, after.fields.length);
  await page.evaluate(() => {
    const node = document.createElement('input');
    node.type = 'password';
    node.setAttribute('role', 'combobox');
    node.setAttribute('aria-label', 'Protected credential');
    Object.defineProperty(node, 'value', {
      get() {
        throw new Error('Sensitive input was read');
      },
    });
    document.body.append(node);
  });
  const protectedReport = await page.evaluate(readFormDocument);
  const password = protectedReport.fields.at(-1);
  assert.equal(password.type, 'password');
  assert.equal(password.value, null);
  console.log('Protected native input stays omitted despite an ARIA role');
} finally {
  await browser?.close();
  await fixture.close();
}
