const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { verifyToken } = require('../middleware/auth');

router.get('/', verifyToken, async (req, res) => {
  try {
    const [hospitals] = await db.query('SELECT * FROM hospitals WHERE IsActive = 1');
    res.status(200).json(hospitals);
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
});

router.get('/:id', verifyToken, async (req, res) => {
  try {
    const [hospital] = await db.query(
      'SELECT * FROM hospitals WHERE HospitalID = ?',
      [req.params.id]
    );
    if (hospital.length === 0) {
      return res.status(404).json({ message: 'Hospital not found.' });
    }
    res.status(200).json(hospital[0]);
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
});

router.get('/specialty/:specialty', verifyToken, async (req, res) => {
  try {
    const [hospitals] = await db.query(
      'SELECT * FROM hospitals WHERE Specialties LIKE ? AND IsActive = 1',
      [`%${req.params.specialty}%`]
    );
    res.status(200).json(hospitals);
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;