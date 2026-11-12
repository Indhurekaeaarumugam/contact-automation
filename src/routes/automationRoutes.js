const express = require('express');
const controller = require('../controllers/automationController');

const router = express.Router();

router.get('/health', controller.health);
router.get('/status', controller.status);
router.post('/runs', controller.startRun); // run until all websites are done
router.post('/runs/stop', controller.stop); // stop after the current batch
router.post('/batches', controller.runBatch); // one batch only

module.exports = router;
