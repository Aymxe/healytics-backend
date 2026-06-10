const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

app.use(cors());
app.use(express.json());

// Routes
const authRoutes = require('./routes/auth');
const patientRoutes = require('./routes/patients');
const doctorRoutes = require('./routes/doctors');
const appointmentRoutes = require('./routes/appointments');
const medicalRoutes = require('./routes/medicalrecords');
const prescriptionRoutes = require('./routes/prescriptions');
const hospitalRoutes = require('./routes/hospitals');
const pharmacyRoutes = require('./routes/pharmacies');
const adminRoutes = require('./routes/admin');
const chatRoutes = require('./routes/chat');
const messageRoutes = require('./routes/messages');

app.use('/api/auth', authRoutes);
app.use('/api/patients', patientRoutes);
app.use('/api/doctors', doctorRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/medical', medicalRoutes);
app.use('/api/prescriptions', prescriptionRoutes);
app.use('/api/hospitals', hospitalRoutes);
app.use('/api/pharmacies', pharmacyRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/messages', messageRoutes);

// Test route
app.get('/', (req, res) => {
  res.json({ message: 'Healytics API is running!' });

});

// Ensure every specialty has at least 2 doctors for the referral system
const db = require('./config/db');
const bcrypt = require('bcryptjs');

const ensureBackupDoctors = async () => {
  const backups = [
    { specialty: 'Cardiology',    name: 'Dr. Rania Saleh',   hospitalID: 'H007' },
    { specialty: 'Neurology',     name: 'Dr. Khalil Nouri',  hospitalID: 'H001' },
    { specialty: 'Pediatrics',    name: 'Dr. Dina Farouk',   hospitalID: 'H003' },
    { specialty: 'Orthopedic',    name: 'Dr. Tariq Yilmaz',  hospitalID: 'H002' },
    { specialty: 'Physiotherapy', name: 'Dr. Amal Mansour',  hospitalID: 'H002' },
  ];

  for (const b of backups) {
    const [[{ cnt }]] = await db.query('SELECT COUNT(*) AS cnt FROM doctors WHERE Specialty = ?', [b.specialty]);
    if (cnt >= 2) continue;

    const [last] = await db.query('SELECT DoctorID FROM doctors ORDER BY DoctorID DESC LIMIT 1');
    const lastNum = last.length > 0 ? parseInt(last[0].DoctorID.replace(/\D/g, '')) || 0 : 0;
    const newDoctorID = `D${String(lastNum + 1).padStart(3, '0')}`;

    await db.query(
      "INSERT IGNORE INTO doctors (DoctorID, Name, Specialty, Availability, HospitalID, MaxPatients) VALUES (?, ?, ?, 'Available', ?, 12)",
      [newDoctorID, b.name, b.specialty, b.hospitalID]
    );

    // Create user account for the doctor
    const [lastUser] = await db.query('SELECT UserID FROM users ORDER BY UserID DESC LIMIT 1');
    const lastUserNum = lastUser.length > 0 ? parseInt(lastUser[0].UserID.replace(/\D/g, '')) || 0 : 0;
    const newUserID = `U${String(lastUserNum + 1).padStart(3, '0')}`;
    const email = `${b.name.toLowerCase().replace(/[^a-z]/g, '').slice(3, 10)}@healytics-staff.com`;
    const hash = await bcrypt.hash('Doctor@123', 10);

    await db.query(
      "INSERT IGNORE INTO users (UserID, RefID, FullName, Email, Password, Role, IsActive, CreatedDate, LastLogin) VALUES (?, ?, ?, ?, ?, 'Doctor', 1, CURDATE(), CURDATE())",
      [newUserID, newDoctorID, b.name, email, hash]
    );

    console.log(`✅ Added backup doctor: ${b.name} (${b.specialty}) → ${newDoctorID}`);
  }
};

ensureBackupDoctors().catch(err => console.error('Backup doctors init error:', err.sqlMessage || err.message));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});