const express = require('express');
const session = require('express-session');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const { db, findUserByEmail, createUser, verifyPassword, findUserById } = require('./therapy_database');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'therapy-secret-key';

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const sessionMiddleware = session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24, httpOnly: true, secure: false }
});
app.use(sessionMiddleware);

// Share session with Socket.IO
io.use((socket, next) => {
  sessionMiddleware(socket.request, {}, next);
});

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

// ---------- Auth ----------
app.post('/api/signup', (req, res) => {
  const { role, code, name, email, phone, password } = req.body;
  if (!role || !['patient', 'doctor'].includes(role))
    return res.status(400).json({ error: 'Invalid role' });

  if (!code || (role === 'doctor' && !code.startsWith('Doc')))
    return res.status(400).json({ error: 'Doctor code must start with "Doc"' });
  if (role === 'patient' && !code.startsWith('Pt'))
    return res.status(400).json({ error: 'Patient code must start with "Pt"' });

  if (!name || !email || !password)
    return res.status(400).json({ error: 'Name, email and password required' });

  if (findUserByEmail(email))
    return res.status(400).json({ error: 'Email already registered' });

  const userId = createUser(role, name, email, phone || '', password);
  if (!userId) return res.status(500).json({ error: 'Failed to create user' });

  req.session.userId = userId;
  req.session.role = role;
  req.session.name = name;
  res.json({ userId, role, name });
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  const user = findUserByEmail(email);
  if (!user || !verifyPassword(password, user.password_hash))
    return res.status(400).json({ error: 'Invalid email or password' });
  req.session.userId = user.id;
  req.session.role = user.role;
  req.session.name = user.name;
  res.json({ userId: user.id, role: user.role, name: user.name });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ message: 'Logged out' }));
});

app.get('/api/me', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  res.json({ userId: req.session.userId, role: req.session.role, name: req.session.name });
});

app.delete('/api/account', requireLogin, (req, res) => {
  try {
    db.prepare('DELETE FROM users WHERE id = ?').run(req.session.userId);
    req.session.destroy();
    res.json({ message: 'Account deleted' });
  } catch { res.status(500).json({ error: 'Failed to delete account' }); }
});

// ---------- Public ----------
app.get('/api/public/therapists', (req, res) => {
  try {
    const doctors = db.prepare('SELECT name FROM users WHERE role = ?').all('doctor');
    res.json(doctors);
  } catch { res.status(500).json({ error: 'Failed to fetch therapists' }); }
});

// ---------- Doctors ----------
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

app.delete('/api/slots/:id', requireRole('doctor'), (req, res) => {
  try {
    const info = db.prepare(
      'DELETE FROM availability WHERE id = ? AND doctor_id = ? AND is_booked = 0'
    ).run(req.params.id, req.session.userId);
    if (info.changes === 0) return res.status(404).json({ error: 'Slot not found' });
    res.json({ message: 'Slot deleted' });
  } catch { res.status(500).json({ error: 'Failed to delete slot' }); }
});

app.get('/api/doctor/schedule', requireRole('doctor'), (req, res) => {
  try {
    const slots = db.prepare(
      `SELECT a.id, a.date, a.time, a.is_booked,
              u.name AS patient_name, u.email AS patient_email, u.phone AS patient_phone
       FROM availability a
       LEFT JOIN users u ON a.patient_id = u.id
       WHERE a.doctor_id = ?
       ORDER BY a.date, a.time`
    ).all(req.session.userId);
    res.json(slots);
  } catch { res.status(500).json({ error: 'Failed to fetch schedule' }); }
});

app.delete('/api/doctor/appointments/:id', requireRole('doctor'), (req, res) => {
  try {
    const info = db.prepare(
      'UPDATE availability SET is_booked = 0, patient_id = NULL WHERE id = ? AND doctor_id = ? AND is_booked = 1'
    ).run(req.params.id, req.session.userId);
    if (info.changes === 0) return res.status(404).json({ error: 'Appointment not found' });
    res.json({ message: 'Appointment cancelled' });
  } catch { res.status(500).json({ error: 'Failed to cancel' }); }
});

// ---------- Patients ----------
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
       FROM availability a JOIN users u ON a.doctor_id = u.id
       WHERE a.patient_id = ? AND a.is_booked = 1
       ORDER BY a.date, a.time`
    ).all(req.session.userId);
    res.json(appointments);
  } catch { res.status(500).json({ error: 'Failed to fetch appointments' }); }
});

app.delete('/api/appointments/:id', requireRole('patient'), (req, res) => {
  try {
    const info = db.prepare(
      'UPDATE availability SET is_booked = 0, patient_id = NULL WHERE id = ? AND patient_id = ? AND is_booked = 1'
    ).run(req.params.id, req.session.userId);
    if (info.changes === 0) return res.status(404).json({ error: 'Appointment not found' });
    res.json({ message: 'Appointment cancelled' });
  } catch { res.status(500).json({ error: 'Failed to cancel' }); }
});

// ==================================================
//  CLIENT ASSIGNMENT (doctors pick clients)
// ==================================================
app.get('/api/clients/available', requireRole('doctor'), (req, res) => {
  try {
    const rows = db.prepare(
      `SELECT u.id, u.name, u.email, u.phone
       FROM users u
       WHERE u.role = 'patient'
         AND u.id NOT IN (SELECT patient_id FROM assignments)
       ORDER BY u.name`
    ).all();
    res.json(rows);
  } catch { res.status(500).json({ error: 'Failed to fetch clients' }); }
});

app.get('/api/clients/mine', requireRole('doctor'), (req, res) => {
  try {
    const rows = db.prepare(
      `SELECT u.id, u.name, u.email, u.phone, a.created_at
       FROM assignments a JOIN users u ON a.patient_id = u.id
       WHERE a.doctor_id = ?
       ORDER BY u.name`
    ).all(req.session.userId);
    res.json(rows);
  } catch { res.status(500).json({ error: 'Failed to fetch your clients' }); }
});

app.post('/api/clients/assign/:patientId', requireRole('doctor'), (req, res) => {
  const patientId = req.params.patientId;
  try {
    const patient = findUserById(patientId);
    if (!patient || patient.role !== 'patient')
      return res.status(404).json({ error: 'Patient not found' });

    const existing = db.prepare('SELECT * FROM assignments WHERE patient_id = ?').get(patientId);
    if (existing) return res.status(400).json({ error: 'Patient already has a therapist' });

    db.prepare('INSERT INTO assignments (doctor_id, patient_id) VALUES (?, ?)')
      .run(req.session.userId, patientId);

    // Notify patient in real-time if connected
    io.to(`user:${patientId}`).emit('assignment:new', {
      doctorName: req.session.name
    });

    res.json({ message: 'Client assigned' });
  } catch { res.status(500).json({ error: 'Failed to assign client' }); }
});

// Patient: get my therapist
app.get('/api/my-therapist', requireRole('patient'), (req, res) => {
  try {
    const row = db.prepare(
      `SELECT u.id, u.name, u.email, u.phone
       FROM assignments a JOIN users u ON a.doctor_id = u.id
       WHERE a.patient_id = ?`
    ).get(req.session.userId);
    res.json(row || null);
  } catch { res.status(500).json({ error: 'Failed to fetch therapist' }); }
});

// ==================================================
//  CHAT (REST — messages stored in DB)
// ==================================================
app.get('/api/chat/messages/:otherId', requireLogin, (req, res) => {
  const me = req.session.userId;
  const other = req.params.otherId;
  try {
    // Only allow chat between an assigned patient and their doctor
    const allowed = db.prepare(
      `SELECT 1 FROM assignments
       WHERE (doctor_id = ? AND patient_id = ?) OR (doctor_id = ? AND patient_id = ?)`
    ).get(me, other, other, me);

    if (!allowed) return res.status(403).json({ error: 'You can only chat with your assigned therapist/patient' });

    const rows = db.prepare(
      `SELECT id, sender_id, receiver_id, body, created_at
       FROM messages
       WHERE (sender_id = ? AND receiver_id = ?)
          OR (sender_id = ? AND receiver_id = ?)
       ORDER BY id ASC`
    ).all(me, other, other, me);

    // Mark received messages as read
    db.prepare('UPDATE messages SET is_read = 1 WHERE receiver_id = ? AND sender_id = ?')
      .run(me, other);

    res.json(rows);
  } catch { res.status(500).json({ error: 'Failed to fetch messages' }); }
});

app.post('/api/chat/messages', requireLogin, (req, res) => {
  const me = req.session.userId;
  const { to, body } = req.body;
  if (!to || !body || !body.trim())
    return res.status(400).json({ error: 'Recipient and message required' });

  try {
    const allowed = db.prepare(
      `SELECT 1 FROM assignments
       WHERE (doctor_id = ? AND patient_id = ?) OR (doctor_id = ? AND patient_id = ?)`
    ).get(me, to, to, me);
    if (!allowed) return res.status(403).json({ error: 'Not authorised' });

    const info = db.prepare(
      'INSERT INTO messages (sender_id, receiver_id, body) VALUES (?, ?, ?)'
    ).run(me, to, body.trim());

    const message = db.prepare('SELECT * FROM messages WHERE id = ?').get(info.lastInsertRowid);

    // Emit to both rooms
    io.to(`user:${to}`).emit('chat:message', message);
    io.to(`user:${me}`).emit('chat:message', message);

    res.json(message);
  } catch { res.status(500).json({ error: 'Failed to send message' }); }
});

app.get('/api/chat/unread-count', requireLogin, (req, res) => {
  try {
    const row = db.prepare(
      'SELECT COUNT(*) AS c FROM messages WHERE receiver_id = ? AND is_read = 0'
    ).get(req.session.userId);
    res.json({ count: row.c });
  } catch { res.status(500).json({ error: 'Failed' }); }
});

// ==================================================
//  SOCKET.IO — Real-time delivery + typing indicators
// ==================================================
io.on('connection', (socket) => {
  const userId = socket.request.session?.userId;
  if (!userId) { socket.disconnect(); return; }

  socket.join(`user:${userId}`);
  console.log(`🔌 user ${userId} connected`);

  socket.on('chat:typing', ({ to, isTyping }) => {
    if (!to) return;
    io.to(`user:${to}`).emit('chat:typing', { from: userId, isTyping });
  });

  socket.on('disconnect', () => {
    console.log(`❌ user ${userId} disconnected`);
  });
});

// ---------- SPA catch-all ----------
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

server.listen(PORT, () => {
  console.log(`✅ Therapy Connect running at http://localhost:${PORT}`);
});