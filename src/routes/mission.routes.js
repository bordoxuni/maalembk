const express = require('express');
const { markRequestDone } = require('../controllers/mission.controller');
const { protect } = require('../middlewares/auth.middleware');

const router = express.Router();

router.put('/requests/:id/done', protect, markRequestDone);

module.exports = router;