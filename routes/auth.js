const express = require('express');
const router = express.Router();
const { login, register, logout } = require('../controllers/authController');
const { verifyToken } = require('../middleware/auth');

router.post('/login', login);
router.post('/register', register);
router.post('/logout', verifyToken, logout);

module.exports = router;