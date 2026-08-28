const Database = require('better-sqlite3');
const bcrypt = require('bcrypt');

// Initialize database
const db = new Database('therapy.db');
db.pragma('foreign_keys = ON');

// Create tables if they don't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    role TEXT NOT NULL CHECK(role IN ('patient', 'doctor')),
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    phone TEXT,
    password_hash TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS availability (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    doctor_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    is_booked INTEGER NOT NULL DEFAULT 0 CHECK(is_booked IN (0,1)),
    patient_id INTEGER,
    FOREIGN KEY (doctor_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE(doctor_id, date, time)
  );
`);

// ---------------------- Helpers ----------------------

const findUserByEmail = (email) => {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email);
};

const findUserById = (id) => {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
};

const createUser = (role, name, email, phone, password) => {
  const password_hash = bcrypt.hashSync(password, 10);
  const stmt = db.prepare(
    'INSERT INTO users (role, name, email, phone, password_hash) VALUES (?, ?, ?, ?, ?)'
  );
  try {
    const info = stmt.run(role, name, email, phone, password_hash);
    return info.lastInsertRowid;
  } catch (err) {
    return null;
  }
};

const verifyPassword = (password, hash) => {
  if (!hash) return false;
  return bcrypt.compareSync(password, hash);
};

const authenticateUser = (email, password) => {
  const user = findUserByEmail(email);
  if (!user) return null;
  return verifyPassword(password, user.password_hash) ? user : null;
};

const addAvailability = (doctorId, date, time) => {
  const doctor = findUserById(doctorId);
  if (!doctor || doctor.role !== 'doctor') return null;

  const stmt = db.prepare(
    'INSERT INTO availability (doctor_id, date, time) VALUES (?, ?, ?)'
  );
  try {
    const info = stmt.run(doctorId, date, time);
    return info.lastInsertRowid;
  } catch (err) {
    return null;
  }
};

const listAvailability = (doctorId) => {
  return db.prepare(
    'SELECT * FROM availability WHERE doctor_id = ? AND is_booked = 0'
  ).all(doctorId);
};

const bookSlot = (availabilityId, patientId) => {
  const patient = findUserById(patientId);
  if (!patient || patient.role !== 'patient') return false;

  const stmt = db.prepare(`
    UPDATE availability
    SET is_booked = 1, patient_id = ?
    WHERE id = ? AND is_booked = 0
  `);
  const info = stmt.run(patientId, availabilityId);
  return info.changes > 0;
};

// ---------------------- Exports ----------------------
module.exports = {
  db,
  findUserByEmail,
  findUserById,
  createUser,
  verifyPassword,
  authenticateUser,
  addAvailability,
  listAvailability,
  bookSlot
};

// Self-test when run directly
if (require.main === module) {
  db.exec('DELETE FROM availability; DELETE FROM users;');
  console.log('--- Creating users ---');
  const doctorId = createUser('doctor', 'Dr. Jane Smith', 'jane@example.com', '555-1234', 'securepass123');
  const patientId = createUser('patient', 'John Doe', 'john@example.com', '555-5678', 'mypassword');
  console.log('Doctor ID:', doctorId, '| Patient ID:', patientId);
  console.log('\n--- Database ready ---');
  db.close();
}