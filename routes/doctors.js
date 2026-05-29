const express = require('express');
const router = express.Router();
const {
  getAllDoctors,
  getDoctorById,
  getDoctorSchedule,
  getDoctorAppointments,
  updateAppointmentStatus,
  addMedicalRecord
} = require('../controllers/doctorController');
const { verifyToken, verifyRole } = require('../middleware/auth');

router.get('/', verifyToken, getAllDoctors);
router.get('/:id', verifyToken, getDoctorById);
router.get('/:id/schedule', verifyToken, getDoctorSchedule);
router.get('/:id/appointments', verifyToken, verifyRole('Doctor', 'Admin'), getDoctorAppointments);
router.put('/appointments/:appointmentID/status', verifyToken, verifyRole('Doctor', 'Admin'), updateAppointmentStatus);
router.post('/medical-record', verifyToken, verifyRole('Doctor', 'Admin'), addMedicalRecord);

module.exports = router;