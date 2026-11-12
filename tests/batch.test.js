process.env.LOG_SILENT = '1';
const test = require('node:test');
const assert = require('node:assert');
const { createBatchRunner } = require('../src/services/batchService');
const { selectPending, parseRows } = require('../src/services/sheetsService');
const { ok, fail } = require('../src/services/resultService');

// In-memory stand-in for the Google Sheet.
function fakeSheet(count) {
  const data = Array.from({ length: count }, (_, i) => [`site${i}.com`, '']);
  const writes = [];
  return {
    data,
    writes,
    async getPendingRows(limit, exclude) {
      return selectPending(parseRows(data), limit, exclude);
    },
    async writeResults(results) {
      writes.push(results.length);
      for (const r of results) data[r.rowNumber - 2][1] = r.status;
    },
  };
}

test('processes 25 sites in batches of 10, 10 and 5 until none are left', async () => {
  const sheets = fakeSheet(25);
  const runner = createBatchRunner({ sheets, processSite: async () => ok('done'), batchSize: 10 });
  const state = await runner.run();
  assert.deepStrictEqual(sheets.writes, [10, 10, 5]);
  assert.strictEqual(state.batches, 3);
  assert.strictEqual(state.totals.processed, 25);
  assert.strictEqual(state.totals.success, 25);
  assert.ok(sheets.data.every((r) => r[1] === 'Success'));
  assert.strictEqual(state.running, false);
});

test('never has more than 10 sites open at the same time, and does use all 10', async () => {
  const sheets = fakeSheet(30);
  let inFlight = 0;
  let peak = 0;
  const processSite = async () => {
    inFlight += 1;
    peak = Math.max(peak, inFlight);
    await new Promise((r) => setTimeout(r, 15));
    inFlight -= 1;
    return ok('x');
  };
  await createBatchRunner({ sheets, processSite, batchSize: 10 }).run();
  assert.strictEqual(peak, 10);
});

test('a site that throws is recorded as Failed and does not stop the others', async () => {
  const sheets = fakeSheet(4);
  const processSite = async (row) => {
    if (row.url === 'site1.com') throw new Error('boom');
    if (row.url === 'site2.com') return fail('No Contact Us / Get a Quote page found');
    return ok('fine');
  };
  const state = await createBatchRunner({ sheets, processSite }).run();
  assert.deepStrictEqual(sheets.data.map((r) => r[1]), ['Success', 'Failed', 'Failed', 'Success']);
  assert.strictEqual(state.totals.failed, 2);
  const boom = state.recent.find((r) => r.url === 'site1.com');
  assert.strictEqual(boom.reason, 'boom');
});

test('each row is attempted at most once even if the sheet write did not stick', async () => {
  const sheets = fakeSheet(5);
  sheets.writeResults = async () => {}; // statuses never change, rows would stay "pending"
  let calls = 0;
  const state = await createBatchRunner({ sheets, processSite: async () => (calls++, ok('x')), batchSize: 2 }).run();
  assert.strictEqual(calls, 5);
  assert.strictEqual(state.totals.processed, 5);
});

test('stops the run if results cannot be written to the sheet', async () => {
  const sheets = fakeSheet(30);
  sheets.writeResults = async () => {
    throw new Error('Sheets API down');
  };
  const state = await createBatchRunner({ sheets, processSite: async () => ok('x'), batchSize: 10 }).run();
  assert.strictEqual(state.error, 'Sheets API down');
  assert.strictEqual(state.batches, 0);
  assert.strictEqual(state.running, false);
});

test('maxBatches limits a run to one batch; stop() ends a long run after the current batch', async () => {
  const one = fakeSheet(25);
  const s1 = await createBatchRunner({ sheets: one, processSite: async () => ok('x') }).run({ maxBatches: 1 });
  assert.strictEqual(s1.totals.processed, 10);

  const many = fakeSheet(50);
  const runner = createBatchRunner({
    sheets: many,
    processSite: async () => {
      await new Promise((r) => setTimeout(r, 10));
      return ok('x');
    },
  });
  const promise = runner.run();
  await new Promise((r) => setTimeout(r, 5));
  assert.strictEqual(runner.stop(), true);
  const s2 = await promise;
  assert.strictEqual(s2.totals.processed, 10);
});

test('a second run cannot start while one is active', async () => {
  const runner = createBatchRunner({
    sheets: fakeSheet(10),
    processSite: async () => {
      await new Promise((r) => setTimeout(r, 20));
      return ok('x');
    },
  });
  const first = runner.run();
  assert.strictEqual(runner.start({}), false);
  await assert.rejects(() => runner.run(), { code: 'RUN_ACTIVE' });
  await first;
});
