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
      `SELECT a.*,
              COALESCE(p.Name, 'Unknown Patient') AS PatientName,
              p.Age,
              p.Gender,
              p.SymptomInput,
              p.RecommendedSpecialty,
              a.PatientID
       FROM appointments a
       LEFT JOIN patients p ON a.PatientID = p.PatientID
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

    // When cancelled by doctor: auto-book with alternative doctor + notify patient
    if (status === 'Cancelled') {
      try {
        const [appts] = await db.query(
          `SELECT a.PatientID, a.DoctorID, a.AppointmentDate, d.Specialty, d.Name AS DoctorName
           FROM appointments a
           JOIN doctors d ON a.DoctorID = d.DoctorID
           WHERE a.AppointmentID = ?`,
          [appointmentID]
        );

        if (appts.length > 0) {
          const { PatientID, DoctorID, AppointmentDate, Specialty, DoctorName } = appts[0];

          // Find another available doctor with same specialty
          const [alts] = await db.query(
            "SELECT * FROM doctors WHERE Specialty = ? AND DoctorID != ? AND Availability = 'Available' LIMIT 1",
            [Specialty, DoctorID]
          );

          let altDoctor;
          if (alts.length > 0) {
            altDoctor = alts[0];
          } else {
            // Auto-create a backup doctor for this specialty
            const [lastDoc] = await db.query('SELECT DoctorID FROM doctors ORDER BY DoctorID DESC LIMIT 1');
            const lastNum = lastDoc.length > 0 ? parseInt(lastDoc[0].DoctorID.replace(/\D/g, '')) || 0 : 0;
            const newDocID = `D${String(lastNum + 1).padStart(3, '0')}`;
            const newDocName = `Dr. Support (${Specialty})`;
            await db.query(
              "INSERT IGNORE INTO doctors (DoctorID, Name, Specialty, Availability, HospitalID, MaxPatients) SELECT ?, ?, ?, 'Available', HospitalID, 12 FROM doctors WHERE DoctorID = ? LIMIT 1",
              [newDocID, newDocName, Specialty, DoctorID]
            );
            altDoctor = { DoctorID: newDocID, Name: newDocName, Specialty };
          }

          // Use original date if it's in the future, otherwise use tomorrow
          const origDate = new Date(AppointmentDate);
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          const newDate = origDate > new Date()
            ? origDate.toISOString().slice(0, 10)
            : tomorrow.toISOString().slice(0, 10);

          // Auto-book new appointment with the alternative doctor
          const [lastAppt] = await db.query('SELECT AppointmentID FROM appointments ORDER BY AppointmentID DESC LIMIT 1');
          const lastApptNum = lastAppt.length > 0 ? parseInt(lastAppt[0].AppointmentID.replace(/\D/g, '')) || 0 : 0;
          const newApptID = `A${String(lastApptNum + 1).padStart(3, '0')}`;

          await db.query(
            "INSERT INTO appointments (AppointmentID, PatientID, DoctorID, AppointmentDate, Status) VALUES (?, ?, ?, ?, 'Pending')",
            [newApptID, PatientID, altDoctor.DoctorID, newDate]
          );

          // Notify patient
          const msgBody = `Your appointment with ${DoctorName} was cancelled.\n\nWe have automatically booked you a new appointment:\n• Doctor: ${altDoctor.Name} (${altDoctor.Specialty})\n• Date: ${newDate}\n• Status: Pending\n\nYou can view it in the Appointments page.`;

          const [allMsgs] = await db.query('SELECT MessageID FROM messages');
          const lastMsgNum = allMsgs.length > 0
            ? Math.max(...allMsgs.map(r => parseInt(r.MessageID.replace(/\D/g, '')) || 0))
            : 0;
          const newMsgID = `MSG${String(lastMsgNum + 1).padStart(3, '0')}`;

          await db.query(
            `INSERT INTO messages (MessageID, SenderID, SenderName, SenderRole, Subject, Body, Status, SentAt, RecipientID, RecipientName, Direction)
             VALUES (?, 'SYSTEM', 'Healytics Support', 'System', 'New Appointment Booked Automatically', ?, 'Unread', NOW(), ?, ?, 'ToUser')`,
            [newMsgID, msgBody, PatientID, PatientID]
          ).catch(() => {});
        }
      } catch (refErr) {
        console.error('Auto-referral error:', refErr.sqlMessage || refErr.message);
      }
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

const updateDoctorAvailability = async (req, res) => {
  const { id } = req.params;
  const { availability } = req.body;
  if (req.user.role === 'Doctor' && req.user.refID !== id) {
    return res.status(403).json({ message: 'You can only update your own availability.' });
  }
  if (!['Available', 'Busy'].includes(availability)) {
    return res.status(400).json({ message: 'Invalid availability value.' });
  }
  try {
    await db.query('UPDATE doctors SET Availability = ? WHERE DoctorID = ?', [availability, id]);
    res.status(200).json({ message: 'Availability updated.', availability });
  } catch (error) {
    console.error('Update availability error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

module.exports = {
  getAllDoctors,
  getDoctorById,
  getDoctorSchedule,
  getDoctorAppointments,
  updateAppointmentStatus,
  addMedicalRecord,
  updateDoctorAvailability
};