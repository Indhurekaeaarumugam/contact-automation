// URL helpers shared by the browser layer and the website workflow.

function normalizeUrl(raw) {
  let value = String(raw == null ? '' : raw).trim();
  if (!value) return null;
  if (!/^https?:\/\//i.test(value)) value = 'https://' + value;
  try {
    const u = new URL(value);
    if (!/^https?:$/.test(u.protocol)) return null;
    if (!u.hostname.includes('.') && u.hostname !== 'localhost') return null;
    return u.href;
  } catch (_) {
    return null;
  }
}

function stripWww(hostname) {
  return String(hostname).toLowerCase().replace(/^www\./, '');
}

function hostMatches(hostname, domains) {
  if (!domains || domains.length === 0) return true; // no allow-list configured
  const h = stripWww(hostname);
  return domains.some((d) => {
    const dd = stripWww(d);
    return h === dd || h.endsWith('.' + dd);
  });
}

function isUrlAllowed(url, domains) {
  try {
    return hostMatches(new URL(url).hostname, domains);
  } catch (_) {
    return false;
  }
}

function sameSite(a, b) {
  try {
    const ha = stripWww(new URL(a).hostname);
    const hb = stripWww(new URL(b).hostname);
    return ha === hb || ha.endsWith('.' + hb) || hb.endsWith('.' + ha);
  } catch (_) {
    return false;
  }
}

module.exports = { normalizeUrl, isUrlAllowed, sameSite, hostMatches };
