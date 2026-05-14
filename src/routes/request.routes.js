const express = require('express');
const {
  createRequest,
  getMyRequests,
  getRequestById,
  cancelRequest,
  deleteRequest,
} = require('../controllers/request.controller');
const { protect } = require('../middlewares/auth.middleware');
const { authorize } = require('../middlewares/role.middleware');
const upload = require('../config/multer');

const router = express.Router();

router.post('/', protect, upload.array('images', 5), createRequest);
router.get('/my', protect, authorize('CLIENT'), getMyRequests);
router.get('/:id', protect, getRequestById);
router.put('/:id/cancel', protect, authorize('CLIENT'), cancelRequest);
router.delete('/:id', protect, deleteRequest);

module.exports = router;
