const db = require('../config/db');

const getAllDoctors = async (req, res) => {
  try {
    const [doctors] = await db.query(
      `SELECT d.*, h.Name AS HospitalName 
       FROM doctors d 
       LEFT JOIN hospitals h ON d.HospitalID = h.HospitalID`
    );
    res.status(200).json(doctors);
  } catch (error) {
    console.error('Get doctors error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

const getDoctorById = async (req, res) => {
  const { id } = req.params;
  try {
    const [doctor] = await db.query(
      `SELECT d.*, h.Name AS HospitalName 
       FROM doctors d 
       LEFT JOIN hospitals h ON d.HospitalID = h.HospitalID 
       WHERE d.DoctorID = ?`,
      [id]
    );
    if (doctor.length === 0) {
      return res.status(404).json({ message: 'Doctor not found.' });
    }
    res.status(200).json(doctor[0]);
  } catch (error) {
    console.error('Get doctor error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

const getDoctorSchedule = async (req, res) => {
  const { id } = req.params;
  try {
    const [schedule] = await db.query(
      `SELECT ds.*, h.Name AS HospitalName 
       FROM doctorschedule ds 
       LEFT JOIN hospitals h ON ds.HospitalID = h.HospitalID 
       WHERE ds.DoctorID = ?`,
      [id]
    );
    res.status(200).json(schedule);
  } catch (error) {
    console.error('Get schedule error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

const getDoctorAppointments = async (req, res) => {
  const { id } = req.params;
  try {
    const [appointments] = await db.query(
      `SELECT a.*, p.Name AS PatientName, p.Age, p.Gender, 
              p.SymptomInput, p.RecommendedSpecialty,
              p.PatientID
       FROM appointments a
       JOIN patients p ON a.PatientID = p.PatientID
       WHERE a.DoctorID = ?
       ORDER BY a.AppointmentDate DESC`,
      [id]
    );
    res.status(200).json(appointments);
  } catch (error) {
    console.error('Get doctor appointments error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

const updateAppointmentStatus = async (req, res) => {
  const { appointmentID } = req.params;
  const { status, notes } = req.body;

  const validStatuses = ['Completed', 'Cancelled', 'Pending', 'Confirmed'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ message: 'Invalid status value.' });
  }

  try {
    const [result] = await db.query(
      'UPDATE appointments SET Status = ? WHERE AppointmentID = ?',
      [status, appointmentID]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Appointment not found.' });
    }
    res.status(200).json({ message: 'Appointment status updated successfully.' });
  } catch (error) {
    console.error('Update appointment error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

const addMedicalRecord = async (req, res) => {
  const { patientID, doctorID, diagnosis, treatment, symptomInput, specialty } = req.body;

  if (!patientID || !doctorID || !diagnosis || !treatment) {
    return res.status(400).json({ message: 'PatientID, DoctorID, diagnosis and treatment are required.' });
  }

  try {
    const [lastRecord] = await db.query(
      'SELECT RecordID FROM medicalrecords ORDER BY RecordID DESC LIMIT 1'
    );
    const lastNum = lastRecord.length > 0 ? parseInt(lastRecord[0].RecordID.replace('R', '')) : 0;
    const newID = `R${String(lastNum + 1).padStart(3, '0')}`;

    const [doctor] = await db.query(
      'SELECT Name FROM doctors WHERE DoctorID = ?',
      [doctorID]
    );
    const doctorName = doctor.length > 0 ? doctor[0].Name : '';

    await db.query(
      `INSERT INTO medicalrecords 
       (RecordID, PatientID, Diagnosis, Treatment, DoctorName, VisitDate, SymptomInput, Specialty) 
       VALUES (?, ?, ?, ?, ?, CURDATE(), ?, ?)`,
      [newID, patientID, diagnosis, treatment, doctorName, symptomInput || '', specialty || '']
    );

    res.status(201).json({ message: 'Medical record added successfully.', recordID: newID });

  } catch (error) {
    console.error('Add medical record error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

module.exports = {
  getAllDoctors,
  getDoctorById,
  getDoctorSchedule,
  getDoctorAppointments,
  updateAppointmentStatus,
  addMedicalRecord
};