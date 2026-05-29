const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { verifyToken } = require('../middleware/auth');

router.get('/', verifyToken, async (req, res) => {
  try {
    const [pharmacies] = await db.query(
      'SELECT * FROM pharmacies WHERE IsActive = 1'
    );
    res.status(200).json(pharmacies);
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
});

router.get('/open', verifyToken, async (req, res) => {
  try {
    const [pharmacies] = await db.query(
      'SELECT * FROM pharmacies WHERE Is24Hours = 1 AND IsActive = 1'
    );
    res.status(200).json(pharmacies);
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
});

router.get('/:id', verifyToken, async (req, res) => {
  try {
    const [pharmacy] = await db.query(
      'SELECT * FROM pharmacies WHERE PharmacyID = ?',
      [req.params.id]
    );
    if (pharmacy.length === 0) {
      return res.status(404).json({ message: 'Pharmacy not found.' });
    }
    res.status(200).json(pharmacy[0]);
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;