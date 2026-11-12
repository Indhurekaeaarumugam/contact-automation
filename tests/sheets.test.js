process.env.LOG_SILENT = '1';
const test = require('node:test');
const assert = require('node:assert');
const { parseRows, selectPending, buildUpdates, quoteTab } = require('../src/services/sheetsService');

test('parseRows numbers rows from 2 and tolerates short rows', () => {
  const rows = parseRows([['a.com'], ['b.com', 'Success'], []]);
  assert.deepStrictEqual(rows.map((r) => r.rowNumber), [2, 3, 4]);
  assert.strictEqual(rows[0].status, '');
  assert.strictEqual(rows[1].status, 'Success');
  assert.strictEqual(rows[2].url, '');
});

test('selectPending keeps blank/Pending rows, skips finished and empty-URL rows', () => {
  const rows = parseRows([
    ['a.com', ''],
    ['b.com', 'Success'],
    ['c.com', 'Pending'],
    ['d.com', 'Failed'],
    ['', ''],
    ['e.com', 'pending'],
  ]);
  assert.deepStrictEqual(selectPending(rows, 10).map((r) => r.url), ['a.com', 'c.com', 'e.com']);
});

test('selectPending respects the limit and the exclude set', () => {
  const rows = parseRows(Array.from({ length: 25 }, (_, i) => [`s${i}.com`]));
  assert.strictEqual(selectPending(rows, 10).length, 10);
  const exclude = new Set([2, 3]);
  assert.strictEqual(selectPending(rows, 10, exclude)[0].rowNumber, 4);
});

test('buildUpdates targets columns B:D of the right row and quotes the tab name', () => {
  const updates = buildUpdates('My Leads', [{ rowNumber: 7, status: 'Failed', reason: 'No form', processedAt: 'T' }]);
  assert.strictEqual(updates[0].range, "'My Leads'!B7:D7");
  assert.deepStrictEqual(updates[0].values, [['Failed', 'No form', 'T']]);
  assert.strictEqual(quoteTab("Bob's"), "'Bob''s'");
});
