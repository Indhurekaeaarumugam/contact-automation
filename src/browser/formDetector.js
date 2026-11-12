// Finds the most likely contact / quote form on a page (including forms inside iframes)
// and detects CAPTCHAs that cannot be solved automatically.

const MIN_FORM_SCORE = 6;

// Runs inside the browser. Must be self-contained (no outer variables).
function scoreFormInPage(form) {
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const s = window.getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
  };
  const skipTypes = ['hidden', 'submit', 'button', 'image', 'reset'];
  const inputs = Array.from(form.querySelectorAll('input, textarea, select')).filter(
    (el) => !skipTypes.includes((el.getAttribute('type') || '').toLowerCase()) && visible(el)
  );
  const textareas = inputs.filter((e) => e.tagName === 'TEXTAREA').length;
  const hint = (e) => ((e.name || '') + ' ' + (e.id || '') + ' ' + (e.placeholder || '')).toLowerCase();
  const hasEmail = inputs.some((e) => (e.getAttribute('type') || '').toLowerCase() === 'email' || /e-?mail/.test(hint(e)));
  const hasPassword = inputs.some((e) => (e.getAttribute('type') || '').toLowerCase() === 'password');
  const hasSearch =
    inputs.some((e) => (e.getAttribute('type') || '').toLowerCase() === 'search') ||
    (form.getAttribute('role') || '').toLowerCase() === 'search';
  const looksLikeNewsletter = /newsletter|subscribe|mailchimp|signup/i.test(
    (form.className || '') + ' ' + (form.id || '') + ' ' + (form.getAttribute('action') || '')
  );

  let score = Math.min(inputs.length, 6);
  if (hasEmail) score += 3;
  if (textareas > 0) score += 4;
  if (hasPassword) score -= 10;
  if (hasSearch) score -= 10;
  if (looksLikeNewsletter && textareas === 0) score -= 4;

  return { score, inputCount: inputs.length, textareas, hasEmail, hasPassword, hasSearch };
}

// Returns { frame, handle, info } for the best form, or null.
async function detectForm(page) {
  let best = null;
  for (const frame of page.frames()) {
    let forms;
    try {
      forms = await frame.$$('form');
    } catch (_) {
      continue;
    }
    for (const handle of forms) {
      let info;
      try {
        info = await handle.evaluate(scoreFormInPage);
      } catch (_) {
        continue;
      }
      const usable = !info.hasPassword && !info.hasSearch && info.inputCount >= 2 && info.score >= MIN_FORM_SCORE;
      if (usable && (!best || info.score > best.info.score)) best = { frame, handle, info };
    }
  }
  return best;
}

// Runs inside the browser. Visible challenge widgets only (invisible reCAPTCHA v3 is fine).
function captchaInPage() {
  const big = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 20 && r.height > 20;
  };
  const selectors = [
    '.g-recaptcha:not([data-size="invisible"])',
    '.h-captcha',
    '.cf-turnstile',
    'iframe[src*="recaptcha/api2/anchor"]',
    'iframe[src*="hcaptcha.com/captcha"]',
    'iframe[src*="challenges.cloudflare.com"]',
  ];
  return selectors.some((sel) =>
    Array.from(document.querySelectorAll(sel)).some((el) => big(el) && !el.closest('.grecaptcha-badge'))
  );
}

async function detectCaptcha(page) {
  for (const frame of page.frames()) {
    try {
      if (await frame.evaluate(captchaInPage)) return true;
    } catch (_) {
      /* frame detached */
    }
  }
  return false;
}

module.exports = { detectForm, detectCaptcha, MIN_FORM_SCORE };
