const db = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const getDeviceType = (ua = '') => {
  if (/mobile/i.test(ua)) return 'Mobile';
  if (/tablet|ipad/i.test(ua)) return 'Tablet';
  return 'Desktop';
};

const getClientIP = (req) =>
  (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
  req.socket?.remoteAddress ||
  'Unknown';

const writeAdminLog = async (logID, adminName, deviceType, ip, status) => {
  const now = new Date();
  const loginDate = now.toISOString().split('T')[0]; // YYYY-MM-DD (DATE column)
  const loginTime = now.toTimeString().slice(0, 5);   // HH:MM (varchar column)
  try {
    await db.query(
      `INSERT INTO adminlog (LogID, AdminName, LoginDate, LoginTime, DurationMin, DeviceType, IPAddress, Status)
       VALUES (?, ?, ?, ?, 0, ?, ?, ?)`,
      [logID, adminName, loginDate, loginTime, deviceType, ip, status]
    );
  } catch (err) {
    console.error('adminlog write failed:', err.sqlMessage);
  }
};

const generateLogID = async () => {
  const [rows] = await db.query('SELECT LogID FROM adminlog ORDER BY LogID DESC LIMIT 1');
  const last = rows.length > 0 ? parseInt(rows[0].LogID.replace(/\D/g, '')) || 0 : 0;
  return `AL${String(last + 1).padStart(3, '0')}`;
};

const login = async (req, res) => {
  const { email, password, role } = req.body;

  if (!email || !password || !role) {
    return res.status(400).json({ message: 'Email, password and role are required.' });
  }

  const ua = req.headers['user-agent'] || '';
  const deviceType = getDeviceType(ua);
  const ip = getClientIP(req);

  try {
    const [users] = await db.query(
      'SELECT * FROM users WHERE Email = ? AND Role = ?',
      [email, role]
    );

    if (users.length === 0) {
      if (role === 'Admin') {
        const logID = await generateLogID();
        await writeAdminLog(logID, email, deviceType, ip, 'Failed');
      }
      return res.status(401).json({ message: 'Invalid email or role.' });
    }

    const user = users[0];
    const isMatch = await bcrypt.compare(password, user.Password);

    if (!isMatch) {
      if (role === 'Admin') {
        const logID = await generateLogID();
        await writeAdminLog(logID, user.FullName, deviceType, ip, 'Failed');
      }
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

    let logID = null;
    if (role === 'Admin') {
      logID = await generateLogID();
      await writeAdminLog(logID, user.FullName, deviceType, ip, 'Success');
      await db.query('UPDATE users SET LastLogin = NOW() WHERE UserID = ?', [user.UserID]);
    }

    res.status(200).json({
      message: 'Login successful.',
      token,
      logID,
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
  const { fullName, email, password, role, refID, age, gender, phone } = req.body;

  if (!fullName || !email || !password || !role) {
    return res.status(400).json({ message: 'All fields are required.' });
  }

  const conn = await db.getConnection();
  try {
    const [existing] = await conn.query(
      'SELECT * FROM users WHERE Email = ?',
      [email]
    );

    if (existing.length > 0) {
      conn.release();
      return res.status(409).json({ message: 'Email already registered.' });
    }

    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(password, salt);

    let assignedRefID = refID || null;

    await conn.beginTransaction();

    // Generate UserID (U001, U002, ...)
    const [lastUser] = await conn.query(
      'SELECT UserID FROM users ORDER BY UserID DESC LIMIT 1'
    );
    const lastUserNum =
      lastUser.length > 0
        ? parseInt(lastUser[0].UserID.replace(/\D/g, '')) || 0
        : 0;
    const newUserID = `U${String(lastUserNum + 1).padStart(3, '0')}`;

    if (role === 'Patient') {
      const [lastPatient] = await conn.query(
        'SELECT PatientID FROM patients ORDER BY PatientID DESC LIMIT 1'
      );
      const lastNum =
        lastPatient.length > 0
          ? parseInt(lastPatient[0].PatientID.replace(/\D/g, '')) || 0
          : 0;
      assignedRefID = `P${String(lastNum + 1).padStart(3, '0')}`;

      await conn.query(
        `INSERT INTO patients (PatientID, Name, Age, Gender, \`Condition\`)
         VALUES (?, ?, ?, ?, 'Stable')`,
        [assignedRefID, fullName, age || null, gender || null]
      );
    }

    await conn.query(
      'INSERT INTO users (UserID, RefID, FullName, Email, Password, Role, IsActive, CreatedDate, LastLogin) VALUES (?, ?, ?, ?, ?, ?, 1, CURDATE(), CURDATE())',
      [newUserID, assignedRefID, fullName, email, hashedPassword, role]
    );

    await conn.commit();
    conn.release();

    res.status(201).json({
      message: 'User registered successfully.',
      userID: newUserID,
      refID: assignedRefID
    });

  } catch (error) {
    await conn.rollback();
    conn.release();
    console.error('Register error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

const logout = async (req, res) => {
  const { logID, durationMin } = req.body;
  if (logID && durationMin >= 0) {
    try {
      await db.query(
        `UPDATE adminlog SET DurationMin = ? WHERE LogID = ? AND Status = 'Success'`,
        [Math.max(1, Math.round(durationMin)), logID]
      );
    } catch (err) {
      console.error('Logout log error:', err.sqlMessage);
    }
  }
  res.status(200).json({ message: 'Logged out.' });
};

module.exports = { login, register, logout };