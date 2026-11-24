const recoverCvWorkplacePhone = async ({
  page,
  view,
  evidence,
  status,
  stats,
  check,
  starts,
  directory,
}) => {
  const beforeRecovery = await stats();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await status('not-saved');
  await view.locator('select').nth(1).selectOption('russian');
  await evidence.filter({ hasText: 'Excluded from this CV' }).waitFor();
  const recovered = await stats();
  check(
    recovered.recordReads === beforeRecovery.recordReads,
    'Reload performed provider reads'
  );
  check(
    recovered.attachments === 1 && starts === 1,
    'Reload reattached or restarted observation'
  );
  check(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= globalThis.innerWidth
    ),
    'Phone layout overflows'
  );
  await evidence.evaluate((node) => node.scrollIntoView({ block: 'center' }));
  await page.screenshot({ path: `${directory}/cv-workplace-mcp-phone.png` });
  return recovered;
};

export const verifyCvWorkplaceMcp = async (originalPage) => {
  const source = new URL(originalPage.url());
  const control = source.searchParams.get('control');
  const directory = source.searchParams.get('screenshots');
  await originalPage.goto('about:blank');
  const context = await originalPage.context().browser().newContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const check = (value, message) => {
    if (!value) {
      throw new Error(message);
    }
  };
  const stats = async () => (await page.request.get(control)).json();
  const controlPost = async (path) => {
    const response = await page.request.post(`${control}${path}`);
    check(response.ok(), `Owned native fixture failed ${path}`);
    return response.json();
  };
  const view = page.locator('[data-cv-save-watch]');
  const status = (name) =>
    view.locator(`[data-cv-watch-state="${name}"]`).waitFor();
  const action = (name) => view.locator(`[data-cv-watch-action="${name}"]`);
  let starts = 0;
  let stops = 0;
  page.on('request', (request) => {
    starts += Number(
      request.method() === 'POST' && request.url().endsWith('/cv-watch')
    );
    stops += Number(
      request.method() === 'POST' && request.url().endsWith('/cv-watch-stop')
    );
  });
  try {
    await page.addInitScript(() => {
      globalThis.localStorage.setItem('metaSovereignLocale', 'en');
      globalThis.localStorage.setItem(
        'metaSovereignTutorial',
        '{"off":true,"v":5}'
      );
    });
    await page.goto(`${source.origin}/#/cv`);
    await status('none');
    await action('start').click();
    await status('watching');
    await controlPost('/edit/valid');
    await controlPost('/save');
    await status('saved');
    const verified = await stats();
    check(
      verified.snapshots.length === 2,
      'Both affected CV snapshots are required'
    );
    const evidence = view.locator('[data-cv-workplace-evidence="123"]');
    await evidence.waitFor();
    check(
      (await evidence.textContent()).includes('Included in this CV'),
      'Included membership is missing'
    );
    await view.locator('[data-cv-saved-snapshot] > summary').click();
    check(
      (await view.textContent()).includes(
        'Independent MCP owner revision valid'
      ),
      'Final owner prose is missing'
    );
    await evidence.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `${directory}/cv-workplace-mcp-desktop.png`,
    });
    for (const mode of ['metadata', 'membership', 'challenge']) {
      await controlPost(`/edit/${mode}`);
      await status('edited');
      await controlPost('/save');
      await status('not-saved');
      check(
        JSON.stringify((await stats()).snapshots) ===
          JSON.stringify(verified.snapshots),
        `${mode} replaced verified snapshots`
      );
    }
    const recovered = await recoverCvWorkplacePhone({
      page,
      view,
      evidence,
      status,
      stats,
      check,
      starts,
      directory,
    });
    await action('stop').click();
    await status('stopped');
    await action('reload').click();
    await status('stopped');
    const final = await stats();
    check(
      stops === 1 && final.detached === 1,
      'Stop/reload did not detach exactly once'
    );
    check(
      final.recordReads === recovered.recordReads,
      'Stop/reload performed provider reads'
    );
    check(
      final.ownerSaves === 4 && final.recordNavigations === 4,
      'Verification navigated or saved the native editor'
    );
    check(
      final.recordReads >= 4 && final.recordReads <= 20,
      'Native read count exceeded finite retries'
    );
    check(
      errors.length === 0 && final.errors.length === 0,
      'Browser page errors were observed'
    );
    return {
      cases: 6,
      starts,
      stops,
      ...final,
      snapshots: final.snapshots.map(({ hash, workplace }) => ({
        hash,
        workplace,
      })),
      errors,
    };
  } finally {
    await context.close();
  }
};
