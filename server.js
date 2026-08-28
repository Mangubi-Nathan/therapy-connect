const express = require('express');
const session = require('express-session');
const path = require('path');
const { db, findUserByEmail, createUser, verifyPassword } = require('./therapy_database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: process.env.SESSION_SECRET || 'therapy-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 }
}));

// ---------- Middleware ----------
function requireLogin(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  next();
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
    if (req.session.role !== role) return res.status(403).json({ error: 'Forbidden' });
    next();
  };
}

// ---------- Auth Routes ----------
app.post('/api/signup', (req, res) => {
  const { role, name, email, phone, password } = req.body;
  if (!role || !['patient', 'doctor'].includes(role))
    return res.status(400).json({ error: 'Invalid role' });
  if (!name || !email || !password)
    return res.status(400).json({ error: 'Name, email and password required' });

  const existing = findUserByEmail(email);
  if (existing) return res.status(400).json({ error: 'Email already registered' });

  const userId = createUser(role, name, email, phone || '', password);
  if (!userId) return res.status(500).json({ error: 'Failed to create user' });

  req.session.userId = userId;
  req.session.role = role;
  req.session.name = name;
  res.json({ userId, role, name });
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: 'Email and password required' });

  const user = findUserByEmail(email);
  if (!user || !verifyPassword(password, user.password_hash))
    return res.status(400).json({ error: 'Invalid email or password' });

  req.session.userId = user.id;
  req.session.role = user.role;
  req.session.name = user.name;
  res.json({ userId: user.id, role: user.role, name: user.name });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) return res.status(500).json({ error: 'Logout failed' });
    res.json({ message: 'Logged out' });
  });
});

app.get('/api/me', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  res.json({ userId: req.session.userId, role: req.session.role, name: req.session.name });
});

// ---------- Doctor Routes ----------
app.get('/api/doctors', requireLogin, (req, res) => {
  try {
    const doctors = db.prepare('SELECT id, name, email, phone FROM users WHERE role = ?').all('doctor');
    res.json(doctors);
  } catch { res.status(500).json({ error: 'Failed to fetch doctors' }); }
});

app.get('/api/doctors/:id/availability', requireLogin, (req, res) => {
  try {
    const slots = db.prepare(
      'SELECT id, date, time, is_booked FROM availability WHERE doctor_id = ? AND is_booked = 0 ORDER BY date, time'
    ).all(req.params.id);
    res.json(slots);
  } catch { res.status(500).json({ error: 'Failed to fetch availability' }); }
});

app.post('/api/availability', requireRole('doctor'), (req, res) => {
  const { date, time } = req.body;
  if (!date || !time) return res.status(400).json({ error: 'Date and time required' });
  try {
    db.prepare('INSERT INTO availability (doctor_id, date, time) VALUES (?, ?, ?)')
      .run(req.session.userId, date, time);
    res.json({ message: 'Slot added' });
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(400).json({ error: 'Slot already exists' });
    res.status(500).json({ error: 'Failed to add slot' });
  }
});

// UPDATED: includes patient contact info (email, phone) for doctor's schedule
app.get('/api/doctor/schedule', requireRole('doctor'), (req, res) => {
  try {
    const slots = db.prepare(
      `SELECT a.id, a.date, a.time, a.is_booked, 
              u.name AS patient_name, 
              u.email AS patient_email, 
              u.phone AS patient_phone
       FROM availability a
       LEFT JOIN users u ON a.patient_id = u.id
       WHERE a.doctor_id = ?
       ORDER BY a.date, a.time`
    ).all(req.session.userId);
    res.json(slots);
  } catch { res.status(500).json({ error: 'Failed to fetch schedule' }); }
});

// ---------- Patient Routes ----------
app.post('/api/book', requireRole('patient'), (req, res) => {
  const { slotId } = req.body;
  if (!slotId) return res.status(400).json({ error: 'Slot ID required' });
  try {
    const slot = db.prepare('SELECT * FROM availability WHERE id = ?').get(slotId);
    if (!slot) return res.status(404).json({ error: 'Slot not found' });
    if (slot.is_booked) return res.status(400).json({ error: 'Slot already booked' });

    db.prepare('UPDATE availability SET is_booked = 1, patient_id = ? WHERE id = ?')
      .run(req.session.userId, slotId);
    res.json({ message: 'Appointment booked' });
  } catch { res.status(500).json({ error: 'Failed to book' }); }
});

app.get('/api/patient/appointments', requireRole('patient'), (req, res) => {
  try {
    const appointments = db.prepare(
      `SELECT a.id, a.date, a.time, u.name AS doctor_name, u.email AS doctor_email, u.phone AS doctor_phone
       FROM availability a
       JOIN users u ON a.doctor_id = u.id
       WHERE a.patient_id = ? AND a.is_booked = 1
       ORDER BY a.date, a.time`
    ).all(req.session.userId);
    res.json(appointments);
  } catch { res.status(500).json({ error: 'Failed to fetch appointments' }); }
});

app.delete('/api/appointments/:id', requireRole('patient'), (req, res) => {
  const patientId = req.session.userId;
  const appointmentId = req.params.id;

  try {
    const slot = db.prepare('SELECT * FROM availability WHERE id = ? AND patient_id = ? AND is_booked = 1')
      .get(appointmentId, patientId);
    if (!slot) return res.status(404).json({ error: 'Appointment not found or already cancelled' });

    db.prepare('UPDATE availability SET is_booked = 0, patient_id = NULL WHERE id = ?')
      .run(appointmentId);
    res.json({ message: 'Appointment cancelled' });
  } catch { res.status(500).json({ error: 'Failed to cancel appointment' }); }
});

app.delete('/api/slots/:id', requireRole('doctor'), (req, res) => {
  const doctorId = req.session.userId;
  const slotId = req.params.id;

  try {
    const slot = db.prepare('SELECT * FROM availability WHERE id = ? AND doctor_id = ? AND is_booked = 0')
      .get(slotId, doctorId);
    if (!slot) return res.status(404).json({ error: 'Slot not found, already booked, or not yours' });

    db.prepare('DELETE FROM availability WHERE id = ?').run(slotId);
    res.json({ message: 'Slot deleted' });
  } catch { res.status(500).json({ error: 'Failed to delete slot' }); }
});

app.delete('/api/doctor/appointments/:id', requireRole('doctor'), (req, res) => {
  const doctorId = req.session.userId;
  const appointmentId = req.params.id;

  try {
    const slot = db.prepare('SELECT * FROM availability WHERE id = ? AND doctor_id = ? AND is_booked = 1')
      .get(appointmentId, doctorId);
    if (!slot) return res.status(404).json({ error: 'Appointment not found or not yours' });

    db.prepare('UPDATE availability SET is_booked = 0, patient_id = NULL WHERE id = ?')
      .run(appointmentId);
    res.json({ message: 'Appointment cancelled' });
  } catch { res.status(500).json({ error: 'Failed to cancel appointment' }); }
});

app.delete('/api/account', requireLogin, (req, res) => {
  const userId = req.session.userId;
  try {
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    req.session.destroy();
    res.json({ message: 'Account deleted' });
  } catch { res.status(500).json({ error: 'Failed to delete account' }); }
});

// ---------- Catch-all (SPA) ----------
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`✅ Therapy Connect running at http://localhost:${PORT}`);
});