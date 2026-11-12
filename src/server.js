const env = require('./config/env');
const logger = require('./utils/logger');

const problems = env.validate();
if (problems.length > 0) {
  console.error('Configuration problems:\n - ' + problems.join('\n - '));
  console.error('Copy .env.example to .env and fill it in.');
  process.exit(1);
}

const app = require('./app');
const sheets = require('./services/sheetsService');
const { getDefaultRunner } = require('./services/batchService');
const { closeBrowser } = require('./browser/browserManager');

const server = app.listen(env.port, env.host, () => {
  logger.info(`Dashboard: http://${env.host}:${env.port}  (submission ${env.enableSubmission ? 'ON' : 'OFF - dry run'})`);
  sheets.ensureHeader().catch((err) => logger.warn(`Could not check sheet header: ${err.message}`));
});

async function shutdown(signal) {
  logger.info(`${signal} received, shutting down`);
  getDefaultRunner().stop();
  server.close();
  await closeBrowser();
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
