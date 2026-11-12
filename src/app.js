const path = require('path');
const express = require('express');
const automationRoutes = require('./routes/automationRoutes');
const logger = require('./utils/logger');

const app = express();
app.disable('x-powered-by');
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api', automationRoutes);
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  logger.error(`Unhandled error: ${err.message}`);
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;
