const express = require('express');
const {
  createOffer,
  getOffersForRequest,
  acceptOffer,
  refuseOffer,
  cancelOffer,
  cancelAcceptedOffer,
  deleteOffer,
} = require('../controllers/offer.controller');
const { protect } = require('../middlewares/auth.middleware');
const { authorize } = require('../middlewares/role.middleware');

const router = express.Router();

router.post('/', protect, authorize('TECHNICIAN'), createOffer);
router.get('/request/:id', protect, authorize('CLIENT'), getOffersForRequest);
router.put('/:id/accept', protect, authorize('CLIENT'), acceptOffer);
router.put('/:id/refuse', protect, authorize('CLIENT'), refuseOffer);
router.put('/:id/cancel', protect, authorize('TECHNICIAN'), cancelOffer);
router.put('/:id/cancel-accepted', protect, authorize('TECHNICIAN'), cancelAcceptedOffer);
router.delete('/:id', protect, authorize('TECHNICIAN'), deleteOffer);

module.exports = router;
