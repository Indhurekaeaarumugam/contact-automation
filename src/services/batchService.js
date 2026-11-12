const logger = require('../utils/logger');
const { describeError } = require('../utils/statusHandler');
const { fail, finalize, summarize } = require('./resultService');

const RECENT_LIMIT = 100;

/**
 * Simple Node.js batch loop:
 *   read up to `batchSize` pending rows -> process them all in parallel ->
 *   write results to the sheet -> repeat until no pending rows remain.
 * Dependencies are injected so the loop can be unit tested without a browser or Google.
 */
function createBatchRunner({ sheets, processSite, batchSize = 10, log = logger }) {
  let state = freshState();

  function freshState() {
    return {
      running: false,
      stopRequested: false,
      startedAt: null,
      finishedAt: null,
      batches: 0,
      totals: { processed: 0, success: 0, failed: 0, review: 0 },
      recent: [],
      error: null,
    };
  }

  async function runOneBatch(attempted) {
    const rows = await sheets.getPendingRows(batchSize, attempted);
    if (rows.length === 0) return 0;
    rows.forEach((r) => attempted.add(r.rowNumber)); // a row is tried at most once per run

    log.info(`Batch ${state.batches + 1}: opening ${rows.length} site(s) in parallel`);
    const settled = await Promise.allSettled(rows.map((r) => Promise.resolve().then(() => processSite(r))));
    const results = settled.map((s, i) =>
      finalize(rows[i].rowNumber, rows[i].url, s.status === 'fulfilled' ? s.value : fail(describeError(s.reason)))
    );

    // If this write fails the run stops: we never keep submitting forms we cannot record.
    await sheets.writeResults(results);

    const t = summarize(results);
    state.batches += 1;
    state.totals.processed += t.processed;
    state.totals.success += t.success;
    state.totals.failed += t.failed;
    state.totals.review += t.review;
    state.recent = results.concat(state.recent).slice(0, RECENT_LIMIT);
    log.info(`Batch ${state.batches} done: ${t.success} success, ${t.failed} failed, ${t.review} review`);
    return rows.length;
  }

  async function run({ maxBatches = Infinity } = {}) {
    if (state.running) {
      const err = new Error('A run is already in progress');
      err.code = 'RUN_ACTIVE';
      throw err;
    }
    state = freshState();
    state.running = true;
    state.startedAt = new Date().toISOString();
    const attempted = new Set();
    try {
      while (!state.stopRequested && state.batches < maxBatches) {
        const n = await runOneBatch(attempted);
        if (n === 0) break; // nothing pending: all websites are done
      }
    } catch (err) {
      state.error = err.message;
      log.error(`Run stopped: ${err.message}`);
    } finally {
      state.running = false;
      state.finishedAt = new Date().toISOString();
    }
    return getState();
  }

  // Fire-and-forget version used by the dashboard. Returns false if a run is active.
  function start(options) {
    if (state.running) return false;
    run(options).catch(() => {});
    return true;
  }

  function stop() {
    if (!state.running) return false;
    state.stopRequested = true; // the current batch finishes, then the loop ends
    return true;
  }

  function getState() {
    return { ...state, totals: { ...state.totals }, recent: state.recent.slice() };
  }

  return { run, start, stop, getState };
}

let defaultRunner = null;
function getDefaultRunner() {
  if (!defaultRunner) {
    const env = require('../config/env');
    defaultRunner = createBatchRunner({
      sheets: require('./sheetsService'),
      processSite: require('./websiteService').processWebsite,
      batchSize: env.batchSize,
    });
  }
  return defaultRunner;
}

module.exports = { createBatchRunner, getDefaultRunner };
