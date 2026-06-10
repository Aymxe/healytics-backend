const db = require('../config/db');

const getAllPatients = async (req, res) => {
  try {
    const [patients] = await db.query('SELECT * FROM patients');
    res.status(200).json(patients);
  } catch (error) {
    console.error('Get patients error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

const getPatientById = async (req, res) => {
  const { id } = req.params;
  try {
    const [patient] = await db.query(
      'SELECT * FROM patients WHERE PatientID = ?',
      [id]
    );
    if (patient.length === 0) {
      return res.status(404).json({ message: 'Patient not found.' });
    }
    res.status(200).json(patient[0]);
  } catch (error) {
    console.error('Get patient error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

const getPatientMedicalFile = async (req, res) => {
  const { id } = req.params;
  try {
    const [patient] = await db.query(
      'SELECT * FROM patients WHERE PatientID = ?',
      [id]
    );
    if (patient.length === 0) {
      return res.status(404).json({ message: 'Patient not found.' });
    }

    const [records] = await db.query(
      'SELECT * FROM medicalrecords WHERE PatientID = ? ORDER BY VisitDate DESC',
      [id]
    );

    const [prescriptions] = await db.query(
      'SELECT * FROM prescriptions WHERE PatientID = ? AND IsActive = 1',
      [id]
    );

    const [appointments] = await db.query(
      'SELECT a.*, d.Name AS DoctorName, d.Specialty FROM appointments a JOIN doctors d ON a.DoctorID = d.DoctorID WHERE a.PatientID = ? ORDER BY a.AppointmentDate DESC',
      [id]
    );

    res.status(200).json({
      patient: patient[0],
      medicalRecords: records,
      activePrescriptions: prescriptions,
      appointments
    });

  } catch (error) {
    console.error('Get medical file error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

const getPatientAppointments = async (req, res) => {
  const { id } = req.params;
  try {
    const [appointments] = await db.query(
      `SELECT a.*, d.Name AS DoctorName, d.Specialty 
       FROM appointments a 
       JOIN doctors d ON a.DoctorID = d.DoctorID 
       WHERE a.PatientID = ? 
       ORDER BY a.AppointmentDate DESC`,
      [id]
    );
    res.status(200).json(appointments);
  } catch (error) {
    console.error('Get appointments error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

const bookAppointment = async (req, res) => {
  const { patientID, doctorID, appointmentDate, reason } = req.body;

  if (!patientID || !doctorID || !appointmentDate) {
    return res.status(400).json({ message: 'PatientID, DoctorID and date are required.' });
  }

  try {
    const [conflict] = await db.query(
      'SELECT * FROM appointments WHERE PatientID = ? AND AppointmentDate = ? AND Status != ?',
      [patientID, appointmentDate, 'Cancelled']
    );

    if (conflict.length > 0) {
      return res.status(409).json({ message: 'Patient already has an appointment at this time.' });
    }

    // Sort numerically by stripping the 'A' prefix to avoid alphabetical ordering bugs (A9 > A10 alphabetically)
    const [allIDs] = await db.query('SELECT AppointmentID FROM appointments');
    const lastNum = allIDs.length > 0
      ? Math.max(...allIDs.map(r => parseInt(r.AppointmentID.replace(/\D/g, '')) || 0))
      : 0;
    const newID = `A${String(lastNum + 1).padStart(3, '0')}`;

    await db.query(
      'INSERT INTO appointments (AppointmentID, PatientID, DoctorID, AppointmentDate, Status) VALUES (?, ?, ?, ?, ?)',
      [newID, patientID, doctorID, appointmentDate, 'Pending']
    );
    // reason/notes saved in future schema iteration — currently accepted but not stored

    res.status(201).json({ message: 'Appointment booked successfully.', appointmentID: newID });

  } catch (error) {
    console.error('Book appointment error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

const updatePatient = async (req, res) => {
  const { id } = req.params;
  if (req.user.refID !== id) {
    return res.status(403).json({ message: 'You can only update your own profile.' });
  }
  const { age, gender } = req.body;
  try {
    await db.query(
      'UPDATE patients SET Age = ?, Gender = ? WHERE PatientID = ?',
      [age || null, gender || null, id]
    );
    res.status(200).json({ message: 'Profile updated successfully.' });
  } catch (error) {
    console.error('Update patient error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

module.exports = {
  getAllPatients,
  getPatientById,
  getPatientMedicalFile,
  getPatientAppointments,
  bookAppointment,
  updatePatient
};