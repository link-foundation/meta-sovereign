/**
 * PR #34 review: on phones a `.stack-table` turns each row into a card
 * (see app.css). That only reads well when every body row has exactly
 * one `[data-title]` cell and every other cell names its column through
 * `data-label`; this asserts both on server-rendered markup.
 */

import assert from 'node:assert/strict';

export const assertStackTable = (html, tableClass) => {
  const table = html.match(
    new RegExp(`<table class="${tableClass} stack-table">([\\s\\S]*?)</table>`)
  );
  assert.ok(table, `${tableClass} is not a .stack-table`);
  const body = table[1].slice(table[1].indexOf('<tbody>'));
  const rows = body.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) ?? [];
  assert.ok(rows.length > 0, `${tableClass} has no body rows`);
  for (const row of rows) {
    const cells = row.match(/<td[^>]*>/g) ?? [];
    assert.equal(
      cells.filter((cell) => cell.includes('data-title')).length,
      1,
      `${tableClass}: one title cell per row`
    );
    for (const cell of cells.filter((c) => !c.includes('data-title'))) {
      assert.match(cell, /data-label="[^"]+"/, `${tableClass}: ${cell}`);
    }
  }
};
