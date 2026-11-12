const path = require('path');

try {
  require('dotenv').config();
} catch (_) {
  /* dotenv is a declared dependency; tolerate its absence so pure-logic tests can load this file */
}

const ROOT = path.join(__dirname, '..', '..');

const bool = (v, d) => (v === undefined || v === '' ? d : ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase()));
const int = (v, d) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : d;
};
const list = (v) => String(v || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);

const e = process.env;
const fullName = (e.CONTACT_NAME || '').trim();
const nameParts = fullName.split(/\s+/).filter(Boolean);

const env = {
  root: ROOT,
  port: int(e.PORT, 3000),
  host: e.HOST || '127.0.0.1',

  sheets: {
    spreadsheetId: e.GOOGLE_SHEETS_SPREADSHEET_ID || '',
    tab: e.GOOGLE_SHEETS_TAB || 'Leads',
    credentialsPath: path.resolve(ROOT, e.GOOGLE_APPLICATION_CREDENTIALS || 'credentials/service-account.json'),
  },

  batchSize: int(e.BATCH_SIZE, 10),
  headless: bool(e.HEADLESS, true),
  navTimeoutMs: int(e.NAV_TIMEOUT_MS, 30000),
  siteTimeoutMs: int(e.SITE_TIMEOUT_MS, 90000),
  verifyTimeoutMs: int(e.VERIFY_TIMEOUT_MS, 10000),
  maxContactPagesToTry: int(e.MAX_CONTACT_PAGES_TO_TRY, 6),
  saveFailureScreenshots: bool(e.SAVE_FAILURE_SCREENSHOTS, true),

  enableSubmission: bool(e.ENABLE_FORM_SUBMISSION, true),
  allowedDomains: list(e.ALLOWED_DOMAINS),

  contact: {
    name: fullName,
    firstName: nameParts[0] || '',
    lastName: nameParts.slice(1).join(' '),
    email: (e.CONTACT_EMAIL || '').trim(),
    phone: (e.CONTACT_PHONE || '').trim(),
    company: (e.CONTACT_COMPANY || '').trim(),
    website: (e.CONTACT_WEBSITE || '').trim(),
    subject: (e.CONTACT_SUBJECT || '').trim(),
    message: (e.CONTACT_MESSAGE || '').trim(),
    jobTitle: (e.CONTACT_JOB_TITLE || '').trim(),
    streetAddress: (e.CONTACT_STREET_ADDRESS || '').trim(),
    city: (e.CONTACT_CITY || '').trim(),
    state: (e.CONTACT_STATE || '').trim(),
    zipCode: (e.CONTACT_ZIP_CODE || '').trim(),

  },

  claude: {
    enabled: bool(e.ENABLE_CLAUDE, false),
    apiKey: e.ANTHROPIC_API_KEY || '',
    model: e.CLAUDE_MODEL || 'claude-sonnet-5-5',
  },
};

// Returns a list of problems (empty list = OK).
function validate(config = env) {
  const problems = [];
  if (!config.sheets.spreadsheetId) problems.push('GOOGLE_SHEETS_SPREADSHEET_ID is not set');
  if (!config.contact.name) problems.push('CONTACT_NAME is not set');
  if (!config.contact.email) problems.push('CONTACT_EMAIL is not set');
  if (!config.contact.message) problems.push('CONTACT_MESSAGE is not set');
  if (config.claude.enabled && !config.claude.apiKey) problems.push('ENABLE_CLAUDE=true but ANTHROPIC_API_KEY is not set');
  return problems;
}

module.exports = env;
module.exports.validate = validate;
