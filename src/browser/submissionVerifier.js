// A submission only counts as Success when there is an explicit confirmation signal.

const SUCCESS_TEXT =
  /thank(s| you)|message (has been |was |is )?(sent|received|submitted)|(successfully|successful)\s+(submitted|sent|received)|we('| wi)ll (get back|be in touch|contact you|respond|reply)|received your (message|enquiry|inquiry|request|submission)|your (message|enquiry|inquiry|request|form) (has been|was) (sent|received|submitted)|submission (received|successful)/i;

const SUCCESS_URL = /thank|success|submitted|confirmation|received|sent/i;

const ERROR_TEXT =
  /(please|must) (fill|enter|provide|complete|correct|select|check)|(is|are) required|invalid (email|phone|input)|captcha|verify you are human|something went wrong|failed to send|there was an error|error occurred/i;

function pathOf(url) {
  try {
    const u = new URL(url);
    return u.pathname + u.search;
  } catch (_) {
    return String(url || '');
  }
}

function snippet(text, re) {
  const m = re.exec(text);
  if (!m) return '';
  const start = Math.max(0, m.index - 30);
  return text.slice(start, m.index + 70).replace(/\s+/g, ' ').trim();
}

// Pure function (unit tested). Compares the page before and after clicking submit.
function evaluateSignals({ beforeUrl, afterUrl, beforeText, afterText }) {
  const before = beforeText || '';
  const after = afterText || '';

  const urlChanged = afterUrl !== beforeUrl;
  if (urlChanged && SUCCESS_URL.test(pathOf(afterUrl)) && !SUCCESS_URL.test(pathOf(beforeUrl))) {
    return { success: true, reason: 'Confirmation page reached (URL changed to a thank-you/success page)' };
  }
  if (SUCCESS_TEXT.test(after) && !SUCCESS_TEXT.test(before)) {
    return { success: true, reason: `Confirmation message detected: "${snippet(after, SUCCESS_TEXT)}"` };
  }
  if (ERROR_TEXT.test(after) && !ERROR_TEXT.test(before)) {
    return { success: false, reason: `Form error after submit: "${snippet(after, ERROR_TEXT)}"` };
  }
  return { success: false, reason: 'No confirmation detected after submit' };
}

async function collectText(page) {
  const chunks = [];
  for (const frame of page.frames()) {
    try {
      chunks.push(await frame.evaluate(() => (document.body ? document.body.innerText : '')));
    } catch (_) {
      /* frame navigating or detached */
    }
  }
  return chunks.join('\n').slice(0, 30000);
}

async function takeSnapshot(page) {
  return { beforeUrl: page.url(), beforeText: await collectText(page) };
}

async function verifySubmission(page, snapshot, { timeoutMs = 10000, intervalMs = 500 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let verdict = { success: false, reason: 'No confirmation detected after submit' };
  while (Date.now() < deadline) {
    await page.waitForTimeout(intervalMs).catch(() => {});
    const afterText = await collectText(page);
    verdict = evaluateSignals({ ...snapshot, afterUrl: page.url(), afterText });
    if (verdict.success) return verdict;
  }
  return verdict;
}

module.exports = { evaluateSignals, takeSnapshot, verifySubmission, collectText, SUCCESS_TEXT };
