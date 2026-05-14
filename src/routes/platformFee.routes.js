const express = require('express');
const {
  getFeeByRequestId,
  getFeesByTechnicianId,
  getFeesByClientId,
  getAllFees,
} = require('../controllers/platformFee.controller');
const { protect } = require('../middlewares/auth.middleware');
const { authorize } = require('../middlewares/role.middleware');

const router = express.Router();

// Get fee for a specific request
router.get('/request/:requestId', protect, getFeeByRequestId);

// Get fees for technician (their own fees only)
router.get('/technician/:technicianId', protect, authorize('TECHNICIAN'), getFeesByTechnicianId);

// Get fees for client (their own fees only)
router.get('/client/:clientId', protect, authorize('CLIENT'), getFeesByClientId);

// Get all fees (admin only)
router.get('/all', protect, authorize('ADMIN'), getAllFees);

module.exports = router;
