async (page) => ({
  url: page.url(),
  text: await page.locator('[data-vk-greet]').innerText(),
  reasons: await page.locator('[data-greet-reason]').evaluateAll((rows) =>
    rows.map((row) => ({
      reason: row.dataset.greetReason,
      id: row.dataset.greetId,
    }))
  ),
});
