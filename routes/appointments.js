const express = require('express');
const router = express.Router();
const {
  getAllAppointments,
  getAppointmentById,
  getAppointmentsByStatus,
  cancelAppointment
} = require('../controllers/appointmentController');
const { verifyToken, verifyRole } = require('../middleware/auth');

router.get('/', verifyToken, verifyRole('Admin', 'Doctor'), getAllAppointments);
router.get('/status/:status', verifyToken, verifyRole('Admin', 'Doctor'), getAppointmentsByStatus);
router.get('/:id', verifyToken, getAppointmentById);
router.put('/:id/cancel', verifyToken, cancelAppointment);

module.exports = router;