const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { verifyToken, verifyRole } = require('../middleware/auth');

router.get('/stats', verifyToken, verifyRole('Admin'), async (req, res) => {
  try {
    const [[{ totalPatients }]] = await db.query('SELECT COUNT(*) AS totalPatients FROM patients');
    const [[{ totalDoctors }]] = await db.query('SELECT COUNT(*) AS totalDoctors FROM doctors');
    const [[{ totalAppointments }]] = await db.query('SELECT COUNT(*) AS totalAppointments FROM appointments');
    const [[{ completedAppointments }]] = await db.query("SELECT COUNT(*) AS completedAppointments FROM appointments WHERE Status = 'Completed'");
    const [[{ activePrescriptions }]] = await db.query('SELECT COUNT(*) AS activePrescriptions FROM prescriptions WHERE IsActive = 1');
    const [[{ totalHospitals }]] = await db.query('SELECT COUNT(*) AS totalHospitals FROM hospitals WHERE IsActive = 1');
    const [[{ totalPharmacies }]] = await db.query('SELECT COUNT(*) AS totalPharmacies FROM pharmacies WHERE IsActive = 1');

    const completionRate = totalAppointments > 0
      ? ((completedAppointments / totalAppointments) * 100).toFixed(1)
      : 0;

    res.status(200).json({
      totalPatients,
      totalDoctors,
      totalAppointments,
      completedAppointments,
      activePrescriptions,
      totalHospitals,
      totalPharmacies,
      completionRate: `${completionRate}%`
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
});

router.get('/doctors', verifyToken, verifyRole('Admin'), async (req, res) => {
  try {
    const [doctors] = await db.query(
      `SELECT d.*, h.Name AS HospitalName 
       FROM doctors d 
       LEFT JOIN hospitals h ON d.HospitalID = h.HospitalID`
    );
    res.status(200).json(doctors);
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
});

router.get('/patients', verifyToken, verifyRole('Admin'), async (req, res) => {
  try {
    const [patients] = await db.query('SELECT * FROM patients');
    res.status(200).json(patients);
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
});

router.get('/logs', verifyToken, verifyRole('Admin'), async (req, res) => {
  try {
    const [logs] = await db.query(
      'SELECT * FROM adminlog ORDER BY LoginDate DESC'
    );
    res.status(200).json(logs);
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
});

router.get('/actions', verifyToken, verifyRole('Admin'), async (req, res) => {
  try {
    const [actions] = await db.query(
      'SELECT * FROM adminactions ORDER BY ActionDate DESC'
    );
    res.status(200).json(actions);
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
});

router.put('/doctors/:id/availability', verifyToken, verifyRole('Admin'), async (req, res) => {
  const { availability } = req.body;
  if (!['Available', 'Busy'].includes(availability)) {
    return res.status(400).json({ message: 'Invalid availability value.' });
  }
  try {
    const [result] = await db.query(
      'UPDATE doctors SET Availability = ? WHERE DoctorID = ?',
      [availability, req.params.id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Doctor not found.' });
    }
    res.status(200).json({ message: 'Doctor availability updated successfully.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
});

// Any authenticated user can fetch admin contact info
router.get('/contact', verifyToken, async (req, res) => {
  try {
    const [admins] = await db.query(
      'SELECT FullName, Role, Email, Phone, Department FROM adminprofiles WHERE IsActive = 1'
    );
    res.status(200).json(admins);
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;