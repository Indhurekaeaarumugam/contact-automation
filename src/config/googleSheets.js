const fs = require('fs');
const env = require('./env');

let client = null;

function getSheetsClient() {
  if (client) return client;
  const { google } = require('googleapis');
  if (!fs.existsSync(env.sheets.credentialsPath)) {
    throw new Error(`Google credentials file not found at ${env.sheets.credentialsPath}`);
  }
  const auth = new google.auth.GoogleAuth({
    keyFile: env.sheets.credentialsPath,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  client = google.sheets({ version: 'v4', auth });
  return client;
}

module.exports = { getSheetsClient };
