const Database = require('better-sqlite3');
const bcrypt = require('bcrypt');

const db = new Database('therapy.db');
db.pragma('foreign_keys = ON');

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

  -- NEW: therapist ↔ patient assignments (one active therapist per patient)
  CREATE TABLE IF NOT EXISTS assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    doctor_id INTEGER NOT NULL,
    patient_id INTEGER NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (doctor_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE CASCADE
  );

  -- NEW: chat messages
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id INTEGER NOT NULL,
    receiver_id INTEGER NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_read INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

// ---------------------- Helpers ----------------------
const findUserByEmail = (email) => db.prepare('SELECT * FROM users WHERE email = ?').get(email);
const findUserById = (id) => db.prepare('SELECT * FROM users WHERE id = ?').get(id);

const createUser = (role, name, email, phone, password) => {
  const password_hash = bcrypt.hashSync(password, 10);
  const stmt = db.prepare(
    'INSERT INTO users (role, name, email, phone, password_hash) VALUES (?, ?, ?, ?, ?)'
  );
  try {
    const info = stmt.run(role, name, email, phone, password_hash);
    return info.lastInsertRowid;
  } catch {
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
  try {
    const info = db.prepare(
      'INSERT INTO availability (doctor_id, date, time) VALUES (?, ?, ?)'
    ).run(doctorId, date, time);
    return info.lastInsertRowid;
  } catch {
    return null;
  }
};

const listAvailability = (doctorId) =>
  db.prepare('SELECT * FROM availability WHERE doctor_id = ? AND is_booked = 0').all(doctorId);

const bookSlot = (availabilityId, patientId) => {
  const patient = findUserById(patientId);
  if (!patient || patient.role !== 'patient') return false;
  const info = db.prepare(
    'UPDATE availability SET is_booked = 1, patient_id = ? WHERE id = ? AND is_booked = 0'
  ).run(patientId, availabilityId);
  return info.changes > 0;
};

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