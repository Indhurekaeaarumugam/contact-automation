const STATUS = Object.freeze({
  SUCCESS: 'Success',
  FAILED: 'Failed',
  REVIEW: 'Review required', // only used when ENABLE_FORM_SUBMISSION=false
});

const MAX_REASON_LENGTH = 300;

function cleanReason(reason) {
  return String(reason == null ? '' : reason).replace(/\s+/g, ' ').trim().slice(0, MAX_REASON_LENGTH);
}

// A row is queued when its Status cell is blank or "Pending".
function isPendingStatus(status) {
  const v = String(status == null ? '' : status).trim().toLowerCase();
  return v === '' || v === 'pending';
}

const ERROR_RULES = [
  [/ERR_NAME_NOT_RESOLVED/i, 'Domain not found (DNS error)'],
  [/ERR_CONNECTION_REFUSED/i, 'Connection refused by server'],
  [/ERR_CONNECTION_TIMED_OUT|ERR_TIMED_OUT/i, 'Connection timed out'],
  [/ERR_CONNECTION_RESET|ERR_CONNECTION_CLOSED|ERR_EMPTY_RESPONSE/i, 'Connection closed by server'],
  [/ERR_CERT|ERR_SSL|certificate/i, 'SSL certificate error'],
  [/ERR_TOO_MANY_REDIRECTS/i, 'Too many redirects'],
  [/ERR_ABORTED|ERR_BLOCKED/i, 'Navigation blocked or aborted'],
  [/Timeout \d+ms exceeded|timed out/i, 'Page load or action timed out'],
  [/Target (page, context or browser )?has been closed|browser has been closed|Target closed/i, 'Browser closed unexpectedly'],
];

function describeError(err) {
  const raw = String((err && err.message) || err || 'Unknown error');
  for (const [pattern, text] of ERROR_RULES) {
    if (pattern.test(raw)) return text;
  }
  return cleanReason(raw.split('\n')[0]);
}

module.exports = { STATUS, cleanReason, isPendingStatus, describeError };
