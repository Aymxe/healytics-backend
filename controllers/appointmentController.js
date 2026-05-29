const db = require('../config/db');

const getAllAppointments = async (req, res) => {
  try {
    const [appointments] = await db.query(
      `SELECT a.*, 
              p.Name AS PatientName, 
              d.Name AS DoctorName, 
              d.Specialty
       FROM appointments a
       JOIN patients p ON a.PatientID = p.PatientID
       JOIN doctors d ON a.DoctorID = d.DoctorID
       ORDER BY a.AppointmentDate DESC`
    );
    res.status(200).json(appointments);
  } catch (error) {
    console.error('Get appointments error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

const getAppointmentById = async (req, res) => {
  const { id } = req.params;
  try {
    const [appointment] = await db.query(
      `SELECT a.*, 
              p.Name AS PatientName, p.Age, p.Gender,
              p.SymptomInput, p.RecommendedSpecialty,
              d.Name AS DoctorName, d.Specialty
       FROM appointments a
       JOIN patients p ON a.PatientID = p.PatientID
       JOIN doctors d ON a.DoctorID = d.DoctorID
       WHERE a.AppointmentID = ?`,
      [id]
    );
    if (appointment.length === 0) {
      return res.status(404).json({ message: 'Appointment not found.' });
    }
    res.status(200).json(appointment[0]);
  } catch (error) {
    console.error('Get appointment error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

const getAppointmentsByStatus = async (req, res) => {
  const { status } = req.params;
  try {
    const [appointments] = await db.query(
      `SELECT a.*, 
              p.Name AS PatientName,
              d.Name AS DoctorName, d.Specialty
       FROM appointments a
       JOIN patients p ON a.PatientID = p.PatientID
       JOIN doctors d ON a.DoctorID = d.DoctorID
       WHERE a.Status = ?
       ORDER BY a.AppointmentDate DESC`,
      [status]
    );
    res.status(200).json(appointments);
  } catch (error) {
    console.error('Get appointments by status error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

const cancelAppointment = async (req, res) => {
  const { id } = req.params;
  try {
    const [result] = await db.query(
      'UPDATE appointments SET Status = ? WHERE AppointmentID = ?',
      ['Cancelled', id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Appointment not found.' });
    }
    res.status(200).json({ message: 'Appointment cancelled successfully.' });
  } catch (error) {
    console.error('Cancel appointment error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

module.exports = {
  getAllAppointments,
  getAppointmentById,
  getAppointmentsByStatus,
  cancelAppointment
};