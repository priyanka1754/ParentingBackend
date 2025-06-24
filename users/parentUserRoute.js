const express = require('express');
const router = express.Router();
const userCtrl = require('./parentUserController');
const auth = require('../middleware/auth'); // your JWT/auth middleware

router.post('/register', userCtrl.registerUser);
router.post('/login', userCtrl.loginUser);
router.get('/profile', auth, userCtrl.getUserProfile);
router.post('/avatar', userCtrl.handleAvatarUpload);

module.exports = router;
