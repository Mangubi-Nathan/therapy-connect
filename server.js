const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');
const multer = require('multer');
const { Server } = require('socket.io');
const { db, findUserByEmail, createUser, verifyPassword, findUserById } = require('./therapy_database');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'therapy-secret-key';

// Ensure uploads folder exists
const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Multer setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '';
    cb(null, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 15 * 1024 * 1024 } });

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
io.use((socket, next) => sessionMiddleware(socket.request, {}, next));

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

// ---------- Activity log helper ----------
function logActivity(userId, action, details = '') {
  try {
    db.prepare('INSERT INTO activity_log (user_id, action, details) VALUES (?, ?, ?)')
      .run(userId, action, details);
  } catch {}
}

// ---------- Auth ----------
app.post('/api/signup', (req, res) => {
  const { role, code, name, email, phone, password } = req.body;
  if (!role || !['patient', 'doctor'].includes(role))
    return res.status(400).json({ error: 'Invalid role' });
  if (!code) return res.status(400).json({ error: 'Unique code required' });
  if (role === 'doctor' && !code.startsWith('Doc'))
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
  logActivity(userId, 'signup', `Signed up as ${role}`);
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
  logActivity(user.id, 'login', 'Logged in');
  res.json({ userId: user.id, role: user.role, name: user.name });
});

app.post('/api/logout', (req, res) => {
  const uid = req.session.userId;
  if (uid) logActivity(uid, 'logout', 'Logged out');
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

// ---------- Profile ----------
app.get('/api/profile', requireLogin, (req, res) => {
  try {
    const user = db.prepare(
      'SELECT id, role, name, email, phone, bio, profile_pic FROM users WHERE id = ?'
    ).get(req.session.userId);
    res.json(user);
  } catch { res.status(500).json({ error: 'Failed to fetch profile' }); }
});

app.put('/api/profile', requireLogin, (req, res) => {
  const { name, phone, bio } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  try {
    db.prepare('UPDATE users SET name = ?, phone = ?, bio = ? WHERE id = ?')
      .run(name, phone || '', bio || '', req.session.userId);
    req.session.name = name;
    logActivity(req.session.userId, 'profile_update', 'Updated profile info');
    res.json({ message: 'Profile updated' });
  } catch { res.status(500).json({ error: 'Failed to update' }); }
});

app.post('/api/profile/picture', requireLogin, upload.single('picture'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    const old = db.prepare('SELECT profile_pic FROM users WHERE id = ?').get(req.session.userId);
    if (old?.profile_pic) {
      const oldPath = path.join(UPLOAD_DIR, old.profile_pic);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }
    db.prepare('UPDATE users SET profile_pic = ? WHERE id = ?')
      .run(req.file.filename, req.session.userId);
    logActivity(req.session.userId, 'profile_pic', 'Updated profile picture');
    res.json({ filename: req.file.filename });
  } catch { res.status(500).json({ error: 'Failed to save picture' }); }
});

app.delete('/api/profile/picture', requireLogin, (req, res) => {
  try {
    const old = db.prepare('SELECT profile_pic FROM users WHERE id = ?').get(req.session.userId);
    if (old?.profile_pic) {
      const p = path.join(UPLOAD_DIR, old.profile_pic);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
    db.prepare('UPDATE users SET profile_pic = NULL WHERE id = ?').run(req.session.userId);
    logActivity(req.session.userId, 'profile_pic', 'Removed profile picture');
    res.json({ message: 'Removed' });
  } catch { res.status(500).json({ error: 'Failed' }); }
});

// ---------- Public ----------
app.get('/api/public/therapists', (req, res) => {
  try {
    const doctors = db.prepare('SELECT name FROM users WHERE role = ?').all('doctor');
    res.json(doctors);
  } catch { res.status(500).json({ error: 'Failed' }); }
});

// ---------- Doctors ----------
app.get('/api/doctors', requireLogin, (req, res) => {
  try {
    const doctors = db.prepare(
      'SELECT id, name, email, phone, bio, profile_pic FROM users WHERE role = ?'
    ).all('doctor');
    res.json(doctors);
  } catch { res.status(500).json({ error: 'Failed' }); }
});

app.get('/api/doctors/:id/availability', requireLogin, (req, res) => {
  try {
    const slots = db.prepare(
      'SELECT id, date, time FROM availability WHERE doctor_id = ? AND is_booked = 0 ORDER BY date, time'
    ).all(req.params.id);
    res.json(slots);
  } catch { res.status(500).json({ error: 'Failed' }); }
});

app.post('/api/availability', requireRole('doctor'), (req, res) => {
  const { date, time } = req.body;
  if (!date || !time) return res.status(400).json({ error: 'Date and time required' });
  try {
    db.prepare('INSERT INTO availability (doctor_id, date, time) VALUES (?, ?, ?)')
      .run(req.session.userId, date, time);
    logActivity(req.session.userId, 'slot_added', `Added slot ${date} ${time}`);
    res.json({ message: 'Slot added' });
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(400).json({ error: 'Slot already exists' });
    res.status(500).json({ error: 'Failed' });
  }
});

app.delete('/api/slots/:id', requireRole('doctor'), (req, res) => {
  try {
    const slot = db.prepare('SELECT * FROM availability WHERE id = ? AND doctor_id = ?').get(req.params.id, req.session.userId);
    if (!slot) return res.status(404).json({ error: 'Slot not found' });
    db.prepare('DELETE FROM availability WHERE id = ?').run(req.params.id);
    logActivity(req.session.userId, 'slot_deleted', `Deleted slot ${slot.date} ${slot.time}`);
    res.json({ message: 'Slot deleted' });
  } catch { res.status(500).json({ error: 'Failed' }); }
});

app.get('/api/doctor/schedule', requireRole('doctor'), (req, res) => {
  try {
    const slots = db.prepare(
      `SELECT a.id, a.date, a.time, a.is_booked,
              u.name AS patient_name, u.email AS patient_email, u.phone AS patient_phone, u.profile_pic AS patient_pic
       FROM availability a
       LEFT JOIN users u ON a.patient_id = u.id
       WHERE a.doctor_id = ?
       ORDER BY a.date, a.time`
    ).all(req.session.userId);
    res.json(slots);
  } catch { res.status(500).json({ error: 'Failed' }); }
});

app.delete('/api/doctor/appointments/:id', requireRole('doctor'), (req, res) => {
  try {
    const info = db.prepare(
      'UPDATE availability SET is_booked = 0, patient_id = NULL WHERE id = ? AND doctor_id = ? AND is_booked = 1'
    ).run(req.params.id, req.session.userId);
    if (!info.changes) return res.status(404).json({ error: 'Not found' });
    logActivity(req.session.userId, 'appointment_cancelled', 'Cancelled a patient appointment');
    res.json({ message: 'Cancelled' });
  } catch { res.status(500).json({ error: 'Failed' }); }
});

// ---------- Patients ----------
app.post('/api/book', requireRole('patient'), (req, res) => {
  const { slotId } = req.body;
  if (!slotId) return res.status(400).json({ error: 'Slot ID required' });
  try {
    const slot = db.prepare('SELECT * FROM availability WHERE id = ?').get(slotId);
    if (!slot) return res.status(404).json({ error: 'Slot not found' });
    if (slot.is_booked) return res.status(400).json({ error: 'Already booked' });
    db.prepare('UPDATE availability SET is_booked = 1, patient_id = ? WHERE id = ?')
      .run(req.session.userId, slotId);
    const doc = findUserById(slot.doctor_id);
    logActivity(req.session.userId, 'appointment_booked',
      `Booked appointment with Dr. ${doc?.name || 'unknown'} on ${slot.date} ${slot.time}`);
    res.json({ message: 'Booked' });
  } catch { res.status(500).json({ error: 'Failed' }); }
});

app.get('/api/patient/appointments', requireRole('patient'), (req, res) => {
  try {
    const rows = db.prepare(
      `SELECT a.id, a.date, a.time, u.name AS doctor_name, u.email AS doctor_email,
              u.phone AS doctor_phone, u.profile_pic AS doctor_pic
       FROM availability a JOIN users u ON a.doctor_id = u.id
       WHERE a.patient_id = ? AND a.is_booked = 1
       ORDER BY a.date, a.time`
    ).all(req.session.userId);
    res.json(rows);
  } catch { res.status(500).json({ error: 'Failed' }); }
});

app.delete('/api/appointments/:id', requireRole('patient'), (req, res) => {
  try {
    const info = db.prepare(
      'UPDATE availability SET is_booked = 0, patient_id = NULL WHERE id = ? AND patient_id = ? AND is_booked = 1'
    ).run(req.params.id, req.session.userId);
    if (!info.changes) return res.status(404).json({ error: 'Not found' });
    logActivity(req.session.userId, 'appointment_cancelled', 'Cancelled an appointment');
    res.json({ message: 'Cancelled' });
  } catch { res.status(500).json({ error: 'Failed' }); }
});

// ---------- Assignment ----------
app.get('/api/clients/available', requireRole('doctor'), (req, res) => {
  try {
    const rows = db.prepare(
      `SELECT id, name, email, phone, profile_pic, bio FROM users
       WHERE role = 'patient' AND id NOT IN (SELECT patient_id FROM assignments)
       ORDER BY name`
    ).all();
    res.json(rows);
  } catch { res.status(500).json({ error: 'Failed' }); }
});

app.get('/api/clients/mine', requireRole('doctor'), (req, res) => {
  try {
    const rows = db.prepare(
      `SELECT u.id, u.name, u.email, u.phone, u.profile_pic, u.bio, a.created_at, a.video_room
       FROM assignments a JOIN users u ON a.patient_id = u.id
       WHERE a.doctor_id = ? ORDER BY u.name`
    ).all(req.session.userId);
    res.json(rows);
  } catch { res.status(500).json({ error: 'Failed' }); }
});

app.post('/api/clients/assign/:patientId', requireRole('doctor'), (req, res) => {
  const pid = req.params.patientId;
  try {
    const patient = findUserById(pid);
    if (!patient || patient.role !== 'patient')
      return res.status(404).json({ error: 'Patient not found' });
    if (db.prepare('SELECT 1 FROM assignments WHERE patient_id = ?').get(pid))
      return res.status(400).json({ error: 'Patient already has a therapist' });

    const room = 'therapy-' + crypto.randomBytes(10).toString('hex');
    db.prepare('INSERT INTO assignments (doctor_id, patient_id, video_room) VALUES (?, ?, ?)')
      .run(req.session.userId, pid, room);

    logActivity(req.session.userId, 'client_assigned', `Took ${patient.name} under care`);
    logActivity(pid, 'assigned', `Assigned to Dr. ${req.session.name}`);

    io.to(`user:${pid}`).emit('assignment:new', { doctorName: req.session.name });
    res.json({ message: 'Assigned' });
  } catch { res.status(500).json({ error: 'Failed' }); }
});

app.get('/api/my-therapist', requireRole('patient'), (req, res) => {
  try {
    const row = db.prepare(
      `SELECT u.id, u.name, u.email, u.phone, u.bio, u.profile_pic, a.video_room
       FROM assignments a JOIN users u ON a.doctor_id = u.id
       WHERE a.patient_id = ?`
    ).get(req.session.userId);
    res.json(row || null);
  } catch { res.status(500).json({ error: 'Failed' }); }
});

// ---------- Chat ----------
app.get('/api/chat/messages/:otherId', requireLogin, (req, res) => {
  const me = req.session.userId;
  const other = Number(req.params.otherId);
  try {
    const allowed = db.prepare(
      `SELECT 1 FROM assignments WHERE (doctor_id = ? AND patient_id = ?) OR (doctor_id = ? AND patient_id = ?)`
    ).get(me, other, other, me);
    if (!allowed) return res.status(403).json({ error: 'Not authorised to chat' });

    const rows = db.prepare(
      `SELECT id, sender_id, receiver_id, body, attachment, attachment_type, attachment_name, created_at
       FROM messages
       WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
       ORDER BY id ASC`
    ).all(me, other, other, me);

    db.prepare('UPDATE messages SET is_read = 1 WHERE receiver_id = ? AND sender_id = ?').run(me, other);
    res.json(rows);
  } catch { res.status(500).json({ error: 'Failed' }); }
});

app.post('/api/chat/messages', requireLogin, (req, res) => {
  const me = req.session.userId;
  const { to, body, attachment, attachment_type, attachment_name } = req.body;
  if (!to) return res.status(400).json({ error: 'Recipient required' });
  if (!body && !attachment) return res.status(400).json({ error: 'Message or attachment required' });

  try {
    const allowed = db.prepare(
      `SELECT 1 FROM assignments WHERE (doctor_id = ? AND patient_id = ?) OR (doctor_id = ? AND patient_id = ?)`
    ).get(me, to, to, me);
    if (!allowed) return res.status(403).json({ error: 'Not authorised' });

    const info = db.prepare(
      `INSERT INTO messages (sender_id, receiver_id, body, attachment, attachment_type, attachment_name)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(me, to, body || null, attachment || null, attachment_type || null, attachment_name || null);

    const message = db.prepare('SELECT * FROM messages WHERE id = ?').get(info.lastInsertRowid);

    io.to(`user:${to}`).emit('chat:message', message);
    io.to(`user:${me}`).emit('chat:message', message);

    const sender = findUserById(me);
    logActivity(me, 'message_sent', `Message to ${findUserById(to)?.name || 'user'}`);
    res.json(message);
  } catch { res.status(500).json({ error: 'Failed to send' }); }
});

app.post('/api/upload', requireLogin, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const isImage = /^image\//.test(req.file.mimetype);
  res.json({
    filename: req.file.filename,
    url: `/uploads/${req.file.filename}`,
    type: isImage ? 'image' : 'file',
    name: req.file.originalname
  });
});

// ---------- Activity log ----------
app.get('/api/activity', requireLogin, (req, res) => {
  try {
    const me = req.session.userId;
    const role = req.session.role;
    let rows;
    if (role === 'doctor') {
      rows = db.prepare(
        `SELECT a.*, u.name AS user_name, u.role AS user_role
         FROM activity_log a JOIN users u ON a.user_id = u.id
         WHERE a.user_id = ?
            OR a.user_id IN (SELECT patient_id FROM assignments WHERE doctor_id = ?)
         ORDER BY a.id DESC LIMIT 300`
      ).all(me, me);
    } else {
      rows = db.prepare(
        `SELECT a.*, u.name AS user_name, u.role AS user_role
         FROM activity_log a JOIN users u ON a.user_id = u.id
         WHERE a.user_id = ?
         ORDER BY a.id DESC LIMIT 300`
      ).all(me);
    }
    res.json(rows);
  } catch { res.status(500).json({ error: 'Failed' }); }
});

// ---------- Socket.IO ----------
io.on('connection', (socket) => {
  const userId = socket.request.session?.userId;
  if (!userId) { socket.disconnect(); return; }
  socket.join(`user:${userId}`);

  socket.on('chat:typing', ({ to, isTyping }) => {
    if (to) io.to(`user:${to}`).emit('chat:typing', { from: userId, isTyping });
  });

  socket.on('video:invite', ({ to }) => {
    if (to) {
      const me = findUserById(userId);
      io.to(`user:${to}`).emit('video:invite', { from: userId, fromName: me?.name });
    }
  });

  socket.on('disconnect', () => {});
});

// ---------- SPA ----------
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

server.listen(PORT, () => {
  console.log(`✅ Therapy Connect running at http://localhost:${PORT}`);
});