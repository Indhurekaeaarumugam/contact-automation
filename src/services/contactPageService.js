const env = require('../config/env');
const { gotoPage, dismissOverlays } = require('../browser/browserManager');
const { findContactCandidates } = require('../browser/contactPageFinder');
const { detectForm } = require('../browser/formDetector');
const { describeError } = require('../utils/statusHandler');

/**
 * Starting from the home page that is already open, find a page with a usable contact/quote form.
 * Order: links found on the home page (best score first) -> common paths (/contact-us, /get-a-quote ...)
 * -> the home page itself as a last resort (some sites keep the form in the footer).
 */
async function locateContactForm(page, baseUrl) {
  const { links, fallbacks } = await findContactCandidates(page, baseUrl);

  const seen = new Set();
  const ordered = [];
  for (const url of [...links.map((l) => l.url), ...fallbacks]) {
    const key = url.replace(/\/$/, '');
    if (!seen.has(key)) {
      seen.add(key);
      ordered.push(url);
    }
  }

  for (const url of ordered.slice(0, env.maxContactPagesToTry)) {
    try {
      const status = await gotoPage(page, url);
      if (status && status >= 400) continue;
      await dismissOverlays(page);
      const form = await detectForm(page);
      if (form) return { ok: true, pageUrl: page.url(), form };
    } catch (err) {
      // a dead candidate must not stop the search
      if (/closed/i.test(describeError(err))) throw err;
    }
  }

  try {
    await gotoPage(page, baseUrl);
    await dismissOverlays(page);
    const form = await detectForm(page);
    if (form) return { ok: true, pageUrl: page.url(), form };
  } catch (_) {
    /* fall through */
  }

  return {
    ok: false,
    reason:
      links.length === 0
        ? 'No Contact Us / Get a Quote page found'
        : 'Contact page found but no usable form detected',
  };
}

module.exports = { locateContactForm };
