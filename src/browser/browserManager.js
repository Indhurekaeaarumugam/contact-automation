
const env = require('../config/env');
const { isUrlAllowed } = require('../utils/urlPolicy');

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

let browserPromise = null;

// One shared Microsoft Edge browser;
// every website gets its own isolated context.
function getBrowser() {
  if (!browserPromise) {
    const { chromium } = require('playwright');

    browserPromise = chromium
      .launch({
        channel: 'msedge',
        headless: env.headless,
      })
      .catch((err) => {
        browserPromise = null;
        throw err;
      });
  }

  return browserPromise;
}

async function newContext() {
  const browser = await getBrowser();

  const context = await browser.newContext({
    userAgent: USER_AGENT,
    viewport: { width: 1366, height: 900 },
    locale: 'en-US',
    ignoreHTTPSErrors: true,
  });

  context.setDefaultNavigationTimeout(env.navTimeoutMs);
  context.setDefaultTimeout(15000);

  if (env.allowedDomains.length > 0) {
    // Block page navigations to domains outside ALLOWED_DOMAINS.
    // Third-party scripts, images, CAPTCHA and fonts are not blocked by this rule.
    await context.route('**/*', (route) => {
      const req = route.request();

      if (
        req.isNavigationRequest() &&
        !isUrlAllowed(req.url(), env.allowedDomains)
      ) {
        return route.abort('blockedbyclient');
      }

      return route.continue();
    });
  }

  return context;
}

// Navigate and allow client-side rendered forms to appear.
// Returns the HTTP response status.
async function gotoPage(page, url) {
  const response = await page.goto(url, {
    waitUntil: 'domcontentloaded',
  });

  await page
    .waitForLoadState('networkidle', { timeout: 5000 })
    .catch(() => {});

  return response ? response.status() : null;
}

// Best-effort: close cookie banners that cover the form.
async function dismissOverlays(page) {
  try {
    await page
      .getByRole('button', {
        name: /^(accept( all)?( cookies)?|allow all|i agree|agree|got it|ok|okay)$/i,
      })
      .first()
      .click({ timeout: 1500 });
  } catch (_) {
    // No banner found; continue.
  }
}

// Close the shared Microsoft Edge browser.
async function closeBrowser() {
  if (!browserPromise) return;

  const p = browserPromise;
  browserPromise = null;

  try {
    const browser = await p;
    await browser.close();
  } catch (_) {
    // Browser already closed or launch failed.
  }
}

module.exports = {
  newContext,
  gotoPage,
  dismissOverlays,
  closeBrowser,
};
