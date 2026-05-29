const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { verifyToken, verifyRole } = require('../middleware/auth');

router.get('/', verifyToken, verifyRole('Admin', 'Doctor'), async (req, res) => {
  try {
    const [records] = await db.query(
      `SELECT mr.*, p.Name AS PatientName 
       FROM medicalrecords mr
       JOIN patients p ON mr.PatientID = p.PatientID
       ORDER BY mr.VisitDate DESC`
    );
    res.status(200).json(records);
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
});

router.get('/:id', verifyToken, async (req, res) => {
  try {
    const [record] = await db.query(
      'SELECT * FROM medicalrecords WHERE RecordID = ?',
      [req.params.id]
    );
    if (record.length === 0) return res.status(404).json({ message: 'Record not found.' });
    res.status(200).json(record[0]);
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
});

router.get('/patient/:patientID', verifyToken, async (req, res) => {
  try {
    const [records] = await db.query(
      'SELECT * FROM medicalrecords WHERE PatientID = ? ORDER BY VisitDate DESC',
      [req.params.patientID]
    );
    res.status(200).json(records);
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;