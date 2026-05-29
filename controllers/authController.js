const db = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const login = async (req, res) => {
  const { email, password, role } = req.body;

  if (!email || !password || !role) {
    return res.status(400).json({ message: 'Email, password and role are required.' });
  }

  try {
    const [users] = await db.query(
      'SELECT * FROM users WHERE Email = ? AND Role = ?',
      [email, role]
    );

    if (users.length === 0) {
      return res.status(401).json({ message: 'Invalid email or role.' });
    }

    const user = users[0];

    const isMatch = await bcrypt.compare(password, user.Password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid password.' });
    }

    const token = jwt.sign(
      {
        userID: user.UserID,
        refID: user.RefID,
        fullName: user.FullName,
        email: user.Email,
        role: user.Role
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.status(200).json({
      message: 'Login successful.',
      token,
      user: {
        userID: user.UserID,
        refID: user.RefID,
        fullName: user.FullName,
        email: user.Email,
        role: user.Role
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

const register = async (req, res) => {
  const { fullName, email, password, role, refID } = req.body;

  if (!fullName || !email || !password || !role) {
    return res.status(400).json({ message: 'All fields are required.' });
  }

  try {
    const [existing] = await db.query(
      'SELECT * FROM users WHERE Email = ?',
      [email]
    );

    if (existing.length > 0) {
      return res.status(409).json({ message: 'Email already registered.' });
    }

    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(password, salt);

    const [result] = await db.query(
      'INSERT INTO users (RefID, FullName, Email, Password, Role, IsActive, CreatedDate, LastLogin) VALUES (?, ?, ?, ?, ?, 1, CURDATE(), CURDATE())',
      [refID || null, fullName, email, hashedPassword, role]
    );

    res.status(201).json({
      message: 'User registered successfully.',
      userID: result.insertId
    });

  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

module.exports = { login, register };