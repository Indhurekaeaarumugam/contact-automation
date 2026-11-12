const env = require('../config/env');
const logger = require('../utils/logger');
const { isPendingStatus } = require('../utils/statusHandler');

const HEADER = ['URL', 'Status', 'Reason', 'Processed At'];

// ---------- pure helpers (unit tested) ----------

function quoteTab(tab) {
  return `'${String(tab).replace(/'/g, "''")}'`;
}

// values = rows of A2:D. Row numbers are 1-based sheet rows (data starts at row 2).
function parseRows(values) {
  return (values || []).map((r, i) => ({
    rowNumber: i + 2,
    url: String((r && r[0]) || '').trim(),
    status: String((r && r[1]) || '').trim(),
  }));
}

function selectPending(rows, limit, exclude) {
  const skip = exclude || new Set();
  return rows.filter((r) => r.url && isPendingStatus(r.status) && !skip.has(r.rowNumber)).slice(0, limit);
}

function buildUpdates(tab, results) {
  return results.map((r) => ({
    range: `${quoteTab(tab)}!B${r.rowNumber}:D${r.rowNumber}`,
    values: [[r.status, r.reason, r.processedAt]],
  }));
}

// ---------- Google Sheets I/O ----------

function client() {
  return require('../config/googleSheets').getSheetsClient();
}

async function withRetry(fn, attempts = 3) {
  let lastError;
  for (let i = 1; i <= attempts; i += 1) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      logger.warn(`Sheets request failed (attempt ${i}/${attempts}): ${err.message}`);
      if (i < attempts) await new Promise((r) => setTimeout(r, 1000 * i * i));
    }
  }
  throw lastError;
}

// Returns up to `limit` pending rows, never returning a row number listed in `exclude`.
async function getPendingRows(limit = env.batchSize, exclude = new Set()) {
  const res = await withRetry(() =>
    client().spreadsheets.values.get({
      spreadsheetId: env.sheets.spreadsheetId,
      range: `${quoteTab(env.sheets.tab)}!A2:D`,
    })
  );
  return selectPending(parseRows(res.data.values), limit, exclude);
}

async function writeResults(results) {
  if (!results.length) return;
  await withRetry(() =>
    client().spreadsheets.values.batchUpdate({
      spreadsheetId: env.sheets.spreadsheetId,
      requestBody: { valueInputOption: 'RAW', data: buildUpdates(env.sheets.tab, results) },
    })
  );
}

// Writes the header row if A1:D1 is empty.
async function ensureHeader() {
  const range = `${quoteTab(env.sheets.tab)}!A1:D1`;
  const res = await withRetry(() => client().spreadsheets.values.get({ spreadsheetId: env.sheets.spreadsheetId, range }));
  const first = (res.data.values && res.data.values[0]) || [];
  if (first.length === 0) {
    await withRetry(() =>
      client().spreadsheets.values.update({
        spreadsheetId: env.sheets.spreadsheetId,
        range,
        valueInputOption: 'RAW',
        requestBody: { values: [HEADER] },
      })
    );
  }
}

module.exports = { parseRows, selectPending, buildUpdates, quoteTab, getPendingRows, writeResults, ensureHeader, HEADER };
