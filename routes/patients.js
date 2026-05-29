const express = require('express');
const router = express.Router();
const {
  getAllPatients,
  getPatientById,
  getPatientMedicalFile,
  getPatientAppointments,
  bookAppointment
} = require('../controllers/patientController');
const { verifyToken, verifyRole } = require('../middleware/auth');

router.get('/', verifyToken, verifyRole('Admin', 'Doctor'), getAllPatients);
router.get('/:id', verifyToken, getPatientById);
router.get('/:id/medical-file', verifyToken, getPatientMedicalFile);
router.get('/:id/appointments', verifyToken, getPatientAppointments);
router.post('/book', verifyToken, verifyRole('Patient', 'Admin'), bookAppointment);

module.exports = router;