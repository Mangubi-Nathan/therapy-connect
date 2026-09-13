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

  CREATE TABLE IF NOT EXISTS assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    doctor_id INTEGER NOT NULL,
    patient_id INTEGER NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (doctor_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id INTEGER NOT NULL,
    receiver_id INTEGER NOT NULL,
    body TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_read INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    details TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

// ---- Migrations (safe for existing databases) ----
function ensureColumn(table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some(c => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}
ensureColumn('users', 'profile_pic', 'TEXT');
ensureColumn('users', 'bio', 'TEXT');
ensureColumn('messages', 'attachment', 'TEXT');
ensureColumn('messages', 'attachment_type', 'TEXT');
ensureColumn('messages', 'attachment_name', 'TEXT');
ensureColumn('assignments', 'video_room', 'TEXT');

// ---- Helpers ----
const findUserByEmail = (email) => db.prepare('SELECT * FROM users WHERE email = ?').get(email);
const findUserById = (id) => db.prepare('SELECT * FROM users WHERE id = ?').get(id);

const createUser = (role, name, email, phone, password) => {
  const password_hash = bcrypt.hashSync(password, 10);
  try {
    const info = db.prepare(
      'INSERT INTO users (role, name, email, phone, password_hash) VALUES (?, ?, ?, ?, ?)'
    ).run(role, name, email, phone, password_hash);
    return info.lastInsertRowid;
  } catch { return null; }
};

const verifyPassword = (password, hash) => hash ? bcrypt.compareSync(password, hash) : false;

const authenticateUser = (email, password) => {
  const user = findUserByEmail(email);
  return user && verifyPassword(password, user.password_hash) ? user : null;
};

module.exports = {
  db, findUserByEmail, findUserById,
  createUser, verifyPassword, authenticateUser
};