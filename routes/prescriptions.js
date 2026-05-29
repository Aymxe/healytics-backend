const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { verifyToken, verifyRole } = require('../middleware/auth');

router.get('/', verifyToken, verifyRole('Admin', 'Doctor'), async (req, res) => {
  try {
    const [prescriptions] = await db.query(
      `SELECT pr.*, p.Name AS PatientName
       FROM prescriptions pr
       JOIN patients p ON pr.PatientID = p.PatientID
       ORDER BY pr.PrescriptionID DESC`
    );
    res.status(200).json(prescriptions);
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
});

router.get('/patient/:patientID', verifyToken, async (req, res) => {
  try {
    const [prescriptions] = await db.query(
      'SELECT * FROM prescriptions WHERE PatientID = ? ORDER BY PrescriptionID DESC',
      [req.params.patientID]
    );
    res.status(200).json(prescriptions);
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
});

router.get('/active', verifyToken, async (req, res) => {
  try {
    const [prescriptions] = await db.query(
      `SELECT pr.*, p.Name AS PatientName
       FROM prescriptions pr
       JOIN patients p ON pr.PatientID = p.PatientID
       WHERE pr.IsActive = 1`
    );
    res.status(200).json(prescriptions);
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
});

router.post('/', verifyToken, verifyRole('Doctor', 'Admin'), async (req, res) => {
  const { recordID, patientID, medication, dosage, frequency, durationDays, symptomInput, recommendedSpecialty } = req.body;

  if (!recordID || !patientID || !medication || !dosage || !frequency || !durationDays) {
    return res.status(400).json({ message: 'All fields are required.' });
  }

  try {
    const [last] = await db.query(
      'SELECT PrescriptionID FROM prescriptions ORDER BY PrescriptionID DESC LIMIT 1'
    );
    const lastNum = last.length > 0 ? parseInt(last[0].PrescriptionID.replace('PR', '')) : 0;
    const newID = `PR${String(lastNum + 1).padStart(3, '0')}`;

    await db.query(
      `INSERT INTO prescriptions 
       (PrescriptionID, RecordID, PatientID, Medication, Dosage, Frequency, DurationDays, IsActive, SymptomInput, RecommendedSpecialty) 
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      [newID, recordID, patientID, medication, dosage, frequency, durationDays, symptomInput || '', recommendedSpecialty || '']
    );

    res.status(201).json({ message: 'Prescription added successfully.', prescriptionID: newID });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;