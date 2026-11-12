const { getDefaultRunner } = require('../services/batchService');

const runner = () => getDefaultRunner();

exports.health = (req, res) => {
  res.json({ ok: true, running: runner().getState().running });
};

exports.status = (req, res) => {
  res.json(runner().getState());
};

// Process every pending row, 10 at a time, until the sheet is finished (runs in the background).
exports.startRun = (req, res) => {
  if (!runner().start({})) return res.status(409).json({ error: 'A run is already in progress' });
  return res.status(202).json({ started: true });
};

// Process exactly one batch of up to BATCH_SIZE rows and wait for it to finish.
exports.runBatch = async (req, res, next) => {
  try {
    res.json(await runner().run({ maxBatches: 1 }));
  } catch (err) {
    if (err.code === 'RUN_ACTIVE') return res.status(409).json({ error: err.message });
    return next(err);
  }
};

exports.stop = (req, res) => {
  res.json({ stopping: runner().stop() });
};
