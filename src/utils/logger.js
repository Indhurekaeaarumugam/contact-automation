const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'automation.log');

function write(level, message, meta) {
  if (process.env.LOG_SILENT === '1') return;
  const line = `${new Date().toISOString()} [${level}] ${message}${meta ? ' ' + JSON.stringify(meta) : ''}`;
  (level === 'error' ? console.error : console.log)(line);
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(LOG_FILE, line + '\n');
  } catch (_) {
    /* logging must never crash the run */
  }
}

module.exports = {
  info: (m, x) => write('info', m, x),
  warn: (m, x) => write('warn', m, x),
  error: (m, x) => write('error', m, x),
  LOG_DIR,
};
