const { STATUS, cleanReason } = require('../utils/statusHandler');

const ok = (reason) => ({ status: STATUS.SUCCESS, reason: cleanReason(reason) });
const fail = (reason) => ({ status: STATUS.FAILED, reason: cleanReason(reason) || 'Unknown failure' });
const review = (reason) => ({ status: STATUS.REVIEW, reason: cleanReason(reason) });

// Attach the sheet row and timestamp to an outcome produced by the website workflow.
function finalize(rowNumber, url, outcome, now = new Date()) {
  return {
    rowNumber,
    url,
    status: outcome.status,
    reason: outcome.reason,
    processedAt: now.toISOString(),
  };
}

function summarize(results) {
  const totals = { processed: 0, success: 0, failed: 0, review: 0 };
  for (const r of results) {
    totals.processed += 1;
    if (r.status === STATUS.SUCCESS) totals.success += 1;
    else if (r.status === STATUS.REVIEW) totals.review += 1;
    else totals.failed += 1;
  }
  return totals;
}

module.exports = { ok, fail, review, finalize, summarize };
