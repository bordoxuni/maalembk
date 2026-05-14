const express = require('express');
const { register, login, me, promoteToTechnician, setTechnicianMode, updateProfilePicture } = require('../controllers/auth.controller');
const { protect } = require('../middlewares/auth.middleware');
const upload = require('../config/multer');

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.get('/me', protect, me);
router.put('/me/role', protect, promoteToTechnician);
router.put('/me/mode', protect, setTechnicianMode);
router.put('/me/profile-picture', protect, upload.single('profilePicture'), updateProfilePicture);

module.exports = router;
