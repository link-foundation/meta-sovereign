/** Generate an independent phone inspection against the production page guard. */
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { browserComposerDraft } from '../../js/src/sources/browser-composer-draft.js';
import { browserComposerHtml } from './browser-composer-native-fixture.mjs';

await writeFile(
  'ci-logs/browser-composer-draft-mcp-code.js',
  `async (page) => {
    const assert = { equal: (a, b) => { if (a !== b) throw new Error(JSON.stringify({ actual: a, expected: b })); },
      deepEqual: (a, b) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(JSON.stringify({ actual: a, expected: b })); } };
    const guard = ${browserComposerDraft.toString()};
    const base = 'http://composer.invalid';
    const fixture = route => route.fulfill({ contentType: 'text/html', body: ${JSON.stringify(browserComposerHtml)} });
    await page.route(base + '/**', fixture);
    const errors = [], consoleMessages = [], cases = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => consoleMessages.push({ type: message.type(), text: message.text() }));
    try {
      await page.setViewportSize({ width: 375, height: 812 });
      for (const kind of ['textarea', 'editable']) {
        await page.goto(base + '/?kind=' + kind + '&draft=Owner%20draft');
        const composer = page.getByRole('textbox', { name: 'Message' });
        const inspect = operation => page.evaluate(guard, {
          operation, token: kind, selector: '[data-composer]', text: '',
        });
        assert.equal((await inspect('begin')).code, 'answer-draft-preserved');
        assert.equal(await composer.evaluate(node => 'value' in node ? node.value : node.innerText), 'Owner draft');
        assert.deepEqual(await page.evaluate(() => window.receipts), []);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        if (kind === 'textarea') await page.screenshot({ path: ${JSON.stringify(resolve('docs/case-studies/issue-56/screenshots/browser-composer-draft-phone.png'))} });
        await composer.fill('');
        const cleared = await composer.evaluate(node => 'value' in node ? node.value : node.innerText);
        const clearedResult = await inspect('begin');
        if (cleared) assert.equal(clearedResult.code, 'answer-draft-preserved');
        else assert.equal(clearedResult.verified, true);
        await page.goto(base + '/?kind=' + kind);
        assert.equal((await inspect('begin')).verified, true);
        await composer.fill('Owner changed the composer');
        assert.equal((await inspect('check')).code, 'answer-draft-preserved');
        assert.equal(await composer.evaluate(node => 'value' in node ? node.value : node.innerText), 'Owner changed the composer');
        assert.deepEqual(await page.evaluate(() => window.receipts), []);
        await inspect('release');
        cases.push({ kind, existingDraftRetained: true, changedDraftRetained: true, preservedClearedWhitespace: Boolean(cleared), sends: 0, phoneFits: true });
      }
      assert.deepEqual(errors, []);
      assert.deepEqual(consoleMessages, []);
      return { cases, errors, consoleMessages, liveProvider: false, fixtureClosed: true };
    } finally {
      await page.goto('about:blank');
      await page.unroute(base + '/**', fixture);
    }
  }`
);
