const { sameSite } = require('../utils/urlPolicy');

// Visible link text -> score
const TEXT_RULES = [
  [/contact[\s-]*us/i, 100],
  [/(get|request|receive|ask\s+for)\s+(a\s+|your\s+)?(free\s+)?(quote|estimate|proposal)|free\s+(quote|estimate)|quote\s+request/i, 95],
  [/get\s+in\s+touch|reach\s+(out|us)|talk\s+to\s+(us|sales|an?\s+expert)|speak\s+(to|with)\s+(us|sales)/i, 85],
  [/enquir|inquir/i, 75],
  [/contact/i, 70],
  [/quote|estimate/i, 55],
  [/book\s+(a\s+)?(call|demo|consultation)|schedule\s+(a\s+)?(call|demo)/i, 40],
];

// URL path -> score
const HREF_RULES = [
  [/contact[-_]?us/i, 90],
  [/(get|request)[-_]?(a[-_])?(free[-_])?(quote|estimate)/i, 88],
  [/get[-_]?in[-_]?touch/i, 70],
  [/contact/i, 65],
  [/enquir|inquir/i, 60],
  [/quote|estimate/i, 50],
];

// Paths that look related but are not contact forms.
const NEGATIVE_PATH = /\b(blog|news|press|career|jobs?|privacy|terms|cookie|login|log-in|sign-?in|sign-?up|cart|checkout|faq|policy|sitemap|unsubscribe|tag|category)\b/i;

const MIN_SCORE = 50;

const FALLBACK_PATHS = [
  '/contact-us',
  '/contact',
  '/contactus',
  '/contact.html',
  '/get-a-quote',
  '/request-a-quote',
  '/get-quote',
  '/quote',
  '/enquiry',
  '/inquiry',
];

function bestScore(rules, value) {
  let best = 0;
  for (const [re, weight] of rules) {
    if (re.test(value) && weight > best) best = weight;
  }
  return best;
}

function scoreLink({ text, href }) {
  const t = String(text || '').trim();
  let pathAndQuery = '';
  try {
    const u = new URL(href);
    pathAndQuery = u.pathname + u.search;
  } catch (_) {
    return 0;
  }
  const textScore = t && t.length <= 60 ? bestScore(TEXT_RULES, t) : 0; // long text is a paragraph, not a nav label
  const hrefScore = bestScore(HREF_RULES, pathAndQuery);
  let score = Math.max(textScore, hrefScore);
  if (textScore && hrefScore) score += 10;
  if (score > 0 && NEGATIVE_PATH.test(pathAndQuery)) score -= 60;
  const depth = pathAndQuery.split('/').filter(Boolean).length;
  if (depth > 3) score -= 20;
  return score;
}

// links: [{ text, href }] -> best candidates on the same site, highest score first
function rankCandidates(links, baseUrl, { limit = 5 } = {}) {
  const baseUrlObj = new URL(baseUrl);
  const baseKey = (baseUrlObj.hostname.replace(/^www\./i, '') + baseUrlObj.pathname + baseUrlObj.search).replace(/\/$/, '').toLowerCase();
  const best = new Map();
  for (const link of links || []) {
    let u;
    try {
      u = new URL(link.href);
    } catch (_) {
      continue;
    }
    if (!/^https?:$/.test(u.protocol) || !sameSite(u.href, baseUrl)) continue;
    u.hash = '';
    // www / non-www and trailing-slash variants of the same page count once
    const key = (u.hostname.replace(/^www\./i, '') + u.pathname + u.search).replace(/\/$/, '').toLowerCase();
    if (key === baseKey) continue;
    const score = scoreLink({ text: link.text, href: u.href });
    if (score < MIN_SCORE) continue;
    const prev = best.get(key);
    if (!prev || score > prev.score) best.set(key, { url: u.href, text: String(link.text || '').trim(), score });
  }
  return Array.from(best.values()).sort((a, b) => b.score - a.score).slice(0, limit);
}

function fallbackUrls(baseUrl) {
  const origin = new URL(baseUrl).origin;
  return FALLBACK_PATHS.map((p) => origin + p);
}

async function collectLinks(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('a[href]')).map((a) => {
      const img = a.querySelector('img[alt]');
      const text = (a.innerText || a.getAttribute('aria-label') || a.getAttribute('title') || (img && img.alt) || '').trim();
      return { text: text.slice(0, 120), href: a.href };
    })
  );
}

// Looks at the page currently open (the site's home page).
async function findContactCandidates(page, baseUrl, options) {
  let links = [];
  try {
    links = await collectLinks(page);
  } catch (_) {
    /* page navigated away while reading - fall back to guessed paths */
  }
  return { links: rankCandidates(links, baseUrl, options), fallbacks: fallbackUrls(baseUrl) };
}

module.exports = { scoreLink, rankCandidates, fallbackUrls, findContactCandidates, FALLBACK_PATHS };
