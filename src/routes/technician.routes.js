const express = require('express');
const {
  getMyTechnicianProfile,
  updateTechnicianLocation,
  updateTechnicianAvailability,
  updateTechnicianMode,
  getTechnicianRequests,
  getActiveRequests,
  getTechnicianById,
  verifyIdentity,
  getMyOffers,
  updateBalance,
} = require('../controllers/technician.controller');
const { protect } = require('../middlewares/auth.middleware');
const { authorize } = require('../middlewares/role.middleware');
const upload = require('../config/multer');

const router = express.Router();

router.get('/me', protect, authorize('TECHNICIAN'), getMyTechnicianProfile);
router.get('/requests', protect, authorize('TECHNICIAN'), getTechnicianRequests);
router.get('/active-requests', protect, authorize('TECHNICIAN'), getActiveRequests);
router.get('/offers', protect, authorize('TECHNICIAN'), getMyOffers);
router.get('/:id', getTechnicianById);
router.put('/profile/location', protect, authorize('TECHNICIAN'), updateTechnicianLocation);
router.put('/profile/availability', protect, authorize('TECHNICIAN'), updateTechnicianAvailability);
router.put('/profile/mode', protect, authorize('TECHNICIAN'), updateTechnicianMode);
router.post('/verify-identity', protect, authorize('TECHNICIAN'), upload.fields([{ name: 'idImage', maxCount: 1 }, { name: 'selfie', maxCount: 1 }]), verifyIdentity);
router.post('/balance', protect, authorize('TECHNICIAN'), updateBalance);

module.exports = router;
