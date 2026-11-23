const check = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

export const inspectLinkedinPositionReview = async (page, config) => {
  const { base, planRequestId, beforeBundle, screenshots } = config;
  const layout = page.locator('[data-experience-documents]');
  const result = page.locator('[data-experience-plan-result="completed"]');
  const update = result.locator('[data-experience-plan-kind="update"]');
  const stage = update.locator('[data-experience-linkedin-position-select]');
  const panel = page.locator('[data-linkedin-position-review]');
  const control = (name) =>
    panel.locator(`[data-linkedin-position-action="${name}"]`);
  const jobState = (name) =>
    panel.locator(`[data-linkedin-position-state="${name}"]`);
  const capture = (element, name) =>
    screenshots && element.screenshot({ path: `${screenshots}/${name}.png` });

  if (beforeBundle) {
    await page.route(/\/app\.min\.js(?:\?|$)/u, (route) =>
      route.fulfill({ path: beforeBundle, contentType: 'text/javascript' })
    );
  }
  await page.setViewportSize({ width: 1120, height: 860 });
  await page.goto(`${base}/#/cv`);
  await page.evaluate(
    ({ planRequestId }) => {
      globalThis.localStorage.setItem('metaSovereignLocale', 'en');
      globalThis.localStorage.setItem(
        'meta-sovereign:experience-plan',
        planRequestId
      );
    },
    { planRequestId }
  );
  await page.reload();
  await layout.locator('summary').first().click();
  await update.waitFor();
  if (beforeBundle) {
    check(
      (await stage.count()) === 0,
      'The parent offered no LinkedIn review on an eligible position'
    );
    await capture(update, 'position-before');
    return { before: true };
  }

  const posts = [];
  page.on('request', (request) => {
    if (
      request.method() === 'POST' &&
      request.url().includes('/linkedin-position-')
    ) {
      posts.push(request.url().split('linkedin-position-').at(-1));
    }
  });
  await stage.click();
  await page.locator('[data-linkedin-position-review="draft"]').waitFor();
  check(
    await panel.evaluate((node) => node === document.activeElement),
    'Staging focuses the review'
  );
  check(
    (await control('start').count()) === 0,
    'A draft cannot prepare a provider form'
  );
  check(
    (await panel.innerText()).includes('Worked on Rust and PostgreSQL.'),
    'Shows the exact original description'
  );
  check(
    (await panel.innerText()).includes('Reviewed description.'),
    'Shows the reviewed replacement'
  );
  check(
    (await panel.innerText()).includes(
      'Proposed media link: Fixture Company (https://example.test/portfolio?mode=work)'
    ),
    'Shows the exact proposed media URL and title'
  );
  await capture(panel, 'position-review');
  await control('approve').click();
  await control('start').waitFor();
  check(
    posts.join(',') === 'stage,review',
    'Approval alone never opens or saves'
  );

  await page.route(
    '**/api/cv/experience/linkedin-position-start',
    async (route) => {
      await route.fetch();
      await route.abort('connectionreset');
    }
  );
  await control('start').click();
  await jobState('prepared').waitFor();
  check(
    (await panel.innerText()).includes(
      'Selected in the LinkedIn draft: PostgreSQL'
    ),
    'The follow-up clearly distinguishes a prepared skill from a proposal'
  );
  check(
    (await panel.innerText()).includes(
      'Attached in the LinkedIn draft: Fixture Company (https://example.test/portfolio?mode=work)'
    ),
    'The prepared draft exposes the exact attached URL and title'
  );
  await page.unroute('**/api/cv/experience/linkedin-position-start');
  check(
    posts.join(',') === 'stage,review,start',
    'A lost Start response recovers using GET'
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await capture(panel, 'position-prepared-phone');
  const overflow = await panel.evaluate(
    (node) => node.scrollWidth - node.clientWidth
  );
  check(overflow <= 1, 'The position review fits its phone column');
  for (const locale of ['ru', 'zh', 'hi', 'en']) {
    await page.evaluate(
      (value) => globalThis.localStorage.setItem('metaSovereignLocale', value),
      locale
    );
    await page.reload();
    await layout.locator('summary').first().click();
    await jobState('prepared').waitFor();
    check(
      !/linkedinPosition\./u.test(await panel.innerText()),
      `Review is localized for ${locale}`
    );
  }
  check(
    posts.join(',') === 'stage,review,start',
    'Reload never replays a mutation'
  );
  await control('skip').click();
  await jobState('skipped').waitFor();
  check(
    posts.join(',') === 'stage,review,start,decide',
    'Skip makes exactly one decision'
  );
  check((await jobState('saved').count()) === 0, 'Skip never reports Save');
  return {
    staged: true,
    verifiedAfterReload: true,
    locales: 4,
    skipped: true,
    posted: posts,
  };
};

export const linkedinPositionReviewInspectionCode = (config) =>
  `async (page) => {const check = ${check}; return (${inspectLinkedinPositionReview})(page, ${JSON.stringify(config)});}`;
