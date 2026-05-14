const express = require('express');
const {
  createReview,
  createClientReview,
  getTechnicianReviews,
  getClientReviews,
} = require('../controllers/review.controller');
const { protect } = require('../middlewares/auth.middleware');
const { authorize } = require('../middlewares/role.middleware');

const router = express.Router();

router.post('/', protect, authorize('CLIENT'), createReview);
router.post('/client', protect, authorize('TECHNICIAN'), createClientReview);
router.get('/technician/:id', protect, getTechnicianReviews);
router.get('/client/:id', protect, getClientReviews);

module.exports = router;