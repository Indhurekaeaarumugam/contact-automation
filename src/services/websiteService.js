const path = require('path');
const fs = require('fs');
const env = require('../config/env');
const logger = require('../utils/logger');
const { normalizeUrl, isUrlAllowed } = require('../utils/urlPolicy');
const { describeError } = require('../utils/statusHandler');
const { newContext, gotoPage } = require('../browser/browserManager');
const { detectCaptcha } = require('../browser/formDetector');
const { fillForm, submitForm } = require('../browser/formFiller');
const { takeSnapshot, verifySubmission } = require('../browser/submissionVerifier');
const { locateContactForm } = require('./contactPageService');
const { ok, fail, review } = require('./resultService');

const SCREENSHOT_DIR = path.join(env.root, 'screenshots');

async function openSite(page, url) {
  const attempt = async (target) => {
    const status = await gotoPage(page, target);
    if (status && status >= 400) {
      const hint = [403, 429, 503].includes(status) ? ' (site may block automation)' : '';
      return { ok: false, reason: `Homepage returned HTTP ${status}${hint}` };
    }
    return { ok: true };
  };
  try {
    return await attempt(url);
  } catch (err) {
    // https failed for a reason other than DNS: try plain http once
    if (url.startsWith('https://') && !/ERR_NAME_NOT_RESOLVED/.test(String(err.message))) {
      try {
        return await attempt('http://' + url.slice('https://'.length));
      } catch (_) {
        /* report the original error below */
      }
    }
    return { ok: false, reason: describeError(err) };
  }
}

async function runSteps(page, url) {
  try {
    const opened = await openSite(page, url);
    if (!opened.ok) return fail(opened.reason);

    const located = await locateContactForm(page, page.url());
    if (!located.ok) return fail(located.reason);

    const filled = await fillForm(located.form, env.contact);
    if (!filled.ok) return fail(filled.reason);

    if (await detectCaptcha(page)) return fail('CAPTCHA on the form (cannot be solved automatically)');

    if (!env.enableSubmission) {
      return review(`Dry run on ${located.pageUrl}: filled ${filled.filled.join(', ')}; submission disabled`);
    }

    const snapshot = await takeSnapshot(page);
    await submitForm(located.form.handle);
    const verdict = await verifySubmission(page, snapshot, { timeoutMs: env.verifyTimeoutMs });
    return verdict.success ? ok(`Submitted on ${located.pageUrl}. ${verdict.reason}`) : fail(verdict.reason);
  } catch (err) {
    return fail(describeError(err));
  }
}

async function saveFailureScreenshot(page, row, url) {
  if (!env.saveFailureScreenshots) return;
  try {
    const host = new URL(url).hostname.replace(/[^a-z0-9.-]/gi, '_');
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, `row${row.rowNumber}-${host}.png`), timeout: 5000 });
  } catch (_) {
    /* screenshots are best-effort */
  }
}

/**
 * Full workflow for one sheet row. Never throws: always resolves to
 * { status: 'Success' | 'Failed' | 'Review required', reason }.
 */
async function processWebsite(row) {
  const url = normalizeUrl(row.url);
  if (!url) return fail('Invalid URL');
  if (!isUrlAllowed(url, env.allowedDomains)) return fail('Domain not in ALLOWED_DOMAINS');

  let context = null;
  let timer = null;
  try {
    context = await newContext();
    const page = await context.newPage();
    const work = runSteps(page, url);
    const timeout = new Promise((resolve) => {
      timer = setTimeout(() => resolve(fail(`Timed out after ${Math.round(env.siteTimeoutMs / 1000)}s`)), env.siteTimeoutMs);
    });
    const outcome = await Promise.race([work, timeout]);
    if (outcome.status === 'Failed') await saveFailureScreenshot(page, row, url);
    return outcome;
  } catch (err) {
    logger.warn(`Row ${row.rowNumber} (${row.url}) crashed: ${err.message}`);
    return fail(describeError(err));
  } finally {
    clearTimeout(timer);
    if (context) await context.close().catch(() => {}); // also aborts work that lost the timeout race
  }
}

module.exports = { processWebsite };
