const app = document.getElementById('app');
let currentUser = null;
let slideshowTimer = null;
let socket = null;
let activeChatUserId = null;

// ---------- Utility ----------
function showMessage(msg, type = 'success') {
  const div = document.createElement('div');
  div.className = type;
  div.textContent = msg;
  app.prepend(div);
  setTimeout(() => div.remove(), 3000);
}

async function api(url, method = 'GET', body = null) {
  const options = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) options.body = JSON.stringify(body);
  const res = await fetch(url, options);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// ---------- Session ----------
async function init() {
  try {
    const me = await api('/api/me');
    currentUser = me;
    setupSocket();
    renderDashboard();
  } catch {
    renderLanding();
  }
}

function setupSocket() {
  if (typeof io === 'undefined') return;
  socket = io();
  socket.on('connect', () => console.log('🔌 socket connected'));
  socket.on('chat:message', (msg) => {
    // If the message belongs to the currently open chat, append it
    if (
      activeChatUserId &&
      (msg.sender_id === activeChatUserId || msg.receiver_id === activeChatUserId)
    ) {
      appendMessage(msg);
    } else {
      showMessage(`💬 New message from ${msg.sender_id}`, 'success');
    }
  });
  socket.on('chat:typing', ({ from, isTyping }) => {
    const indicator = document.getElementById('typing-indicator');
    if (indicator && activeChatUserId === from) {
      indicator.textContent = isTyping ? 'typing…' : '';
    }
  });
  socket.on('assignment:new', ({ doctorName }) => {
    showMessage(`👩‍⚕️ ${doctorName} is now your therapist!`, 'success');
  });
}

// ==================================================
//  LANDING PAGE (unchanged from last version)
// ==================================================
function renderLanding() {
  document.body.classList.add('landing-mode');
  app.innerHTML = `
    <div class="landing">
      <div class="slideshow">
        <div class="slide active" style="background-image:url('https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=1920&q=80')"></div>
        <div class="slide" style="background-image:url('https://images.unsplash.com/photo-1506126613408-eca07ce68773?auto=format&fit=crop&w=1920&q=80')"></div>
        <div class="slide" style="background-image:url('https://images.unsplash.com/photo-1499209974431-9dddcece7f88?auto=format&fit=crop&w=1920&q=80')"></div>
        <div class="slide" style="background-image:url('https://images.unsplash.com/photo-1544027993-37dbfe43562a?auto=format&fit=crop&w=1920&q=80')"></div>
      </div>
      <div class="landing-overlay"></div>

      <div class="landing-inner">
        <nav class="landing-nav">
          <div class="brand">🧠 Therapy Connect</div>
          <div class="nav-actions">
            <button class="ghost-btn" onclick="goToAuth('login')">Login</button>
            <button class="primary-btn" onclick="goToAuth('signup')">Sign Up</button>
          </div>
        </nav>

        <section class="hero">
          <h1>Therapy Connect</h1>
          <p class="hero-sub">Your journey to mental wellness starts here.</p>
          <p class="hero-text">Talk to licensed therapists, book appointments, and get the support you deserve — anytime, anywhere.</p>
          <div class="hero-buttons">
            <button class="primary-btn large" onclick="goToAuth('signup')">Get Started</button>
            <button class="ghost-btn large" onclick="scrollToTabs()">Learn More ↓</button>
          </div>
        </section>

        <section class="tabs-section" id="tabs-section">
          <div class="tabs">
            <button class="tab active" onclick="showTab('services', event)">Services</button>
            <button class="tab" onclick="showTab('plans', event)">Treatment Plans</button>
            <button class="tab" onclick="showTab('notices', event)">Notices</button>
            <button class="tab" onclick="showTab('about', event)">About</button>
            <button class="tab" onclick="showTab('therapists', event)">Therapists</button>
            <button class="tab" onclick="showTab('available', event)">Available Now</button>
          </div>
          <div class="tab-content" id="tab-content">${renderServicesTab()}</div>
        </section>

        <footer class="landing-footer">
          <p>© ${new Date().getFullYear()} Therapy Connect · Confidential &amp; Secure</p>
        </footer>
      </div>
    </div>
  `;
  startSlideshow();
}

function startSlideshow() {
  const slides = document.querySelectorAll('.slide');
  if (!slides.length) return;
  if (slideshowTimer) clearInterval(slideshowTimer);
  let index = 0;
  slideshowTimer = setInterval(() => {
    slides[index].classList.remove('active');
    index = (index + 1) % slides.length;
    slides[index].classList.add('active');
  }, 5000);
}
function stopSlideshow() {
  if (slideshowTimer) { clearInterval(slideshowTimer); slideshowTimer = null; }
}
function scrollToTabs() {
  document.getElementById('tabs-section')?.scrollIntoView({ behavior: 'smooth' });
}

function showTab(name, event) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  if (event?.target) event.target.classList.add('active');
  const content = document.getElementById('tab-content');
  switch (name) {
    case 'services':   content.innerHTML = renderServicesTab(); break;
    case 'plans':      content.innerHTML = renderPlansTab(); break;
    case 'notices':    content.innerHTML = renderNoticesTab(); break;
    case 'about':      content.innerHTML = renderAboutTab(); break;
    case 'therapists': content.innerHTML = renderTherapistsTab(); loadTherapistsPreview(); break;
    case 'available':  content.innerHTML = renderAvailableTab(); break;
  }
}

function renderServicesTab() {
  const s = [
    { icon: '💬', title: 'Individual Therapy', desc: 'One-on-one sessions with a licensed therapist.' },
    { icon: '💑', title: 'Couples Counselling', desc: 'Guided sessions for partners.' },
    { icon: '👨‍👩‍👧', title: 'Family Therapy', desc: 'Work through family dynamics safely.' },
    { icon: '👥', title: 'Group Therapy', desc: 'Connect with others in guided sessions.' },
    { icon: '💊', title: 'Medication Prescription', desc: 'Psychiatrist evaluation & prescriptions.' },
    { icon: '📱', title: 'Therapy Chats', desc: 'Message your therapist securely.' },
    { icon: '🚨', title: 'Crisis Support', desc: 'Immediate help — 24/7 counsellors.' },
    { icon: '🧘', title: 'Mindfulness & Wellness', desc: 'Guided meditation and stress tools.' }
  ];
  return `<div class="grid-cards">${s.map(x => `
    <div class="service-card"><div class="service-icon">${x.icon}</div><h3>${x.title}</h3><p>${x.desc}</p></div>
  `).join('')}</div>`;
}

function renderPlansTab() {
  const p = [
    { name: 'Starter', price: 'Free', features: ['Browse therapists', '1 session/month', 'Email support'] },
    { name: 'Standard', price: '$49/mo', features: ['4 sessions/month', 'Therapy chats', 'Priority booking', 'Video & phone'], featured: true },
    { name: 'Premium', price: '$99/mo', features: ['Unlimited sessions', 'Medication consults', '24/7 crisis', 'Dedicated therapist'] }
  ];
  return `<div class="plans-grid">${p.map(x => `
    <div class="plan-card ${x.featured ? 'featured' : ''}">
      ${x.featured ? '<span class="badge">Most Popular</span>' : ''}
      <h3>${x.name}</h3><div class="price">${x.price}</div>
      <ul>${x.features.map(f => `<li>✓ ${f}</li>`).join('')}</ul>
      <button class="primary-btn" onclick="goToAuth('signup')">Choose ${x.name}</button>
    </div>
  `).join('')}</div>`;
}

function renderNoticesTab() {
  const n = [
    { date: 'Aug 2026', title: 'New Therapists Joined', body: 'We have added 12 new licensed therapists.' },
    { date: 'Aug 2026', title: 'Extended Weekend Hours', body: 'Saturday sessions now 9 AM – 6 PM.' },
    { date: 'Jul 2026', title: 'Mental Health Awareness Month', body: 'Free consultations every Friday.' },
    { date: 'Jul 2026', title: 'New Chat Feature', body: 'Message your therapist securely.' }
  ];
  return `<div class="notices-list">${n.map(x => `
    <div class="notice-card"><div class="notice-date">${x.date}</div><h3>${x.title}</h3><p>${x.body}</p></div>
  `).join('')}</div>`;
}

function renderAboutTab() {
  return `<div class="about-content">
    <h2>About Therapy & Mental Health</h2>
    <p>Mental health is just as important as physical health...</p>
    <h3>Why Therapy?</h3><p>Therapy helps you develop coping strategies...</p>
    <h3>Our Mission</h3><p>Quality mental health care accessible to everyone.</p>
    <h3>Confidentiality</h3><p>All sessions are private and protected.</p>
    <div class="emergency-box">⚠️ <strong>In a crisis?</strong> Contact local emergency services immediately.</div>
  </div>`;
}

function renderTherapistsTab() {
  return `<h2>Our Therapists</h2>
    <p class="muted">Meet some of our licensed professionals.</p>
    <div id="therapists-preview" class="grid-cards"><p>Loading…</p></div>`;
}

async function loadTherapistsPreview() {
  try {
    const docs = await api('/api/public/therapists');
    const c = document.getElementById('therapists-preview');
    if (!c) return;
    c.innerHTML = docs.length
      ? docs.map(d => `<div class="service-card"><div class="service-icon">👩‍⚕️</div><h3>Dr. ${d.name}</h3><p>Licensed Therapist</p></div>`).join('')
      : '<p class="muted">No therapists registered yet.</p>';
  } catch { /* ignore */ }
}

function renderAvailableTab() {
  const items = [
    { icon: '🟢', title: 'Video Sessions', desc: 'Instant Google Meet call.' },
    { icon: '🟢', title: 'Phone Sessions', desc: 'Direct call to your therapist.' },
    { icon: '🟢', title: 'Therapy Chats', desc: 'Send a secure message anytime.' },
    { icon: '🟢', title: 'Booking', desc: 'New slots added daily.' },
    { icon: '🟡', title: 'Medication Consults', desc: 'Book in advance.' },
    { icon: '🟢', title: 'Crisis Support', desc: 'On-call 24/7.' }
  ];
  return `<h2>Currently Available</h2><div class="grid-cards">${items.map(x => `
    <div class="service-card"><div class="service-icon">${x.icon}</div><h3>${x.title}</h3><p>${x.desc}</p></div>
  `).join('')}</div>`;
}

function goToAuth(mode) {
  stopSlideshow();
  document.body.classList.remove('landing-mode');
  renderAuth();
  if (mode === 'signup') showSignup();
  else showLogin();
}

// ==================================================
//  AUTH
// ==================================================
function renderAuth() {
  app.innerHTML = `
    <button class="ghost-btn back-home" onclick="renderLanding()">← Back to Home</button>
    <h1>Therapy Connect</h1>
    <div class="card">
      <h2>Welcome</h2>
      <div id="auth-tabs">
        <button onclick="showLogin()">Login</button>
        <button onclick="showSignup()">Sign Up</button>
      </div>
      <div id="auth-forms"></div>
    </div>
  `;
  showLogin();
}

function showLogin() {
  document.getElementById('auth-forms').innerHTML = `
    <h3>Login</h3>
    <input type="email" id="login-email" placeholder="Email">
    <input type="password" id="login-password" placeholder="Password">
    <button onclick="login()">Login</button>
    <div id="login-error" class="error"></div>
  `;
}

function showSignup() {
  document.getElementById('auth-forms').innerHTML = `
    <h3>Sign Up</h3>
    <label>I am a:</label>
    <select id="signup-role">
      <option value="patient">Patient</option>
      <option value="doctor">Doctor</option>
    </select>
    <label>Unique Code (Doctor: "Doc…", Patient: "Pt…")</label>
    <input type="text" id="signup-code" placeholder="e.g. Doc123 or Pt456">
    <input type="text" id="signup-name" placeholder="Full Name">
    <input type="email" id="signup-email" placeholder="Email">
    <input type="tel" id="signup-phone" placeholder="Phone Number">
    <input type="password" id="signup-password" placeholder="Password">
    <button onclick="signup()">Create Account</button>
    <div id="signup-error" class="error"></div>
  `;
}

async function login() {
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;
  try {
    const user = await api('/api/login', 'POST', { email, password });
    currentUser = user;
    setupSocket();
    renderDashboard();
  } catch (err) {
    document.getElementById('login-error').textContent = err.message;
  }
}

async function signup() {
  const role = document.getElementById('signup-role').value;
  const code = document.getElementById('signup-code').value;
  const name = document.getElementById('signup-name').value;
  const email = document.getElementById('signup-email').value;
  const phone = document.getElementById('signup-phone').value;
  const password = document.getElementById('signup-password').value;
  try {
    const user = await api('/api/signup', 'POST', { role, code, name, email, phone, password });
    currentUser = user;
    setupSocket();
    renderDashboard();
  } catch (err) {
    document.getElementById('signup-error').textContent = err.message;
  }
}

// ==================================================
//  DASHBOARD
// ==================================================
function renderDashboard() {
  if (!currentUser) return renderAuth();
  const isDoctor = currentUser.role === 'doctor';
  app.innerHTML = `
    <button class="logout-btn" onclick="logout()">Logout</button>
    <button class="danger-btn" onclick="deleteAccount()" style="position:absolute; top:70px; right:20px;">🗑️ Delete Account</button>
    <h1>Welcome, ${currentUser.name}</h1>
    <p>Role: ${isDoctor ? 'Doctor' : 'Patient'}</p>
    <div id="dashboard-content">
      ${isDoctor ? renderDoctorDashboard() : renderPatientDashboard()}
    </div>
  `;
  if (isDoctor) {
    loadDoctorSchedule();
    loadAvailableClients();
    loadMyClients();
  } else {
    loadDoctors();
    loadMyAppointments();
    loadMyTherapistChat();
  }
}

function renderDoctorDashboard() {
  return `
    <div class="card">
      <h2>Add Available Slot</h2>
      <label>Date:</label><input type="date" id="slot-date">
      <label>Time:</label><input type="time" id="slot-time">
      <button onclick="addSlot()">Add Slot</button>
      <div id="add-slot-msg"></div>
    </div>

    <div class="card">
      <h2>My Schedule</h2>
      <div id="doctor-schedule"></div>
    </div>

    <div class="card">
      <h2>👥 Available Clients</h2>
      <p class="muted">Pick a client to become their therapist.</p>
      <div id="available-clients"></div>
    </div>

    <div class="card">
      <h2>🧑‍🤝‍🧑 My Clients</h2>
      <div id="my-clients"></div>
    </div>
  `;
}

function renderPatientDashboard() {
  return `
    <div class="card">
      <h2>Find a Doctor</h2>
      <div id="doctors-list"></div>
    </div>
    <div class="card">
      <h2>My Appointments</h2>
      <div id="my-appointments"></div>
    </div>
    <div class="card">
      <h2>💬 Chat with My Therapist</h2>
      <div id="chat-wrapper">
        <div id="chat-empty"><p class="muted">You don't have a therapist yet. A therapist will pick you up soon, or you can request one from the list above.</p></div>
        <div id="chat-box" class="chat-box hidden">
          <div class="chat-header">
            <div>
              <strong id="chat-with-name">—</strong>
              <div id="typing-indicator" class="typing"></div>
            </div>
          </div>
          <div id="chat-messages" class="chat-messages"></div>
          <form class="chat-input-bar" onsubmit="sendChatMessage(event)">
            <input type="text" id="chat-input" placeholder="Type a message…" autocomplete="off">
            <button type="submit">Send</button>
          </form>
        </div>
      </div>
    </div>
  `;
}

// ---------- Video call ----------
function startVideoCall(recipientEmail) {
  window.open('https://meet.google.com/new', '_blank');
  const subject = encodeURIComponent('Video Call Invitation');
  const body = encodeURIComponent('Join my Google Meet call:\nhttps://meet.google.com/new');
  window.open(`mailto:${recipientEmail}?subject=${subject}&body=${body}`, '_blank');
}

// ---------- Doctor: slots ----------
async function addSlot() {
  const date = document.getElementById('slot-date').value;
  const time = document.getElementById('slot-time').value;
  if (!date || !time) {
    document.getElementById('add-slot-msg').innerHTML = '<span class="error">Please fill both date and time</span>';
    return;
  }
  try {
    await api('/api/availability', 'POST', { date, time });
    document.getElementById('add-slot-msg').innerHTML = '<span class="success">Slot added!</span>';
    loadDoctorSchedule();
  } catch (err) {
    document.getElementById('add-slot-msg').innerHTML = `<span class="error">${err.message}</span>`;
  }
}

async function loadDoctorSchedule() {
  try {
    const slots = await api('/api/doctor/schedule');
    const c = document.getElementById('doctor-schedule');
    if (!c) return;
    if (!slots.length) { c.innerHTML = '<p>No slots added yet.</p>'; return; }
    c.innerHTML = slots.map(slot => {
      let actions = '';
      if (slot.is_booked && slot.patient_name) {
        actions = `<div>
          <a href="tel:${slot.patient_phone || ''}" class="call-btn">📞 Call</a>
          <button class="video-btn" onclick="startVideoCall('${slot.patient_email}')">🎥 Video</button>
          <button class="danger-btn" onclick="cancelAppointmentByDoctor(${slot.id})">❌ Cancel</button>
        </div>`;
      } else if (!slot.is_booked) {
        actions = `<div><button class="danger-btn" onclick="deleteSlot(${slot.id})">🗑️ Delete</button></div>`;
      }
      return `<div class="slot ${slot.is_booked ? 'booked' : ''}">
        <span>${slot.date} at ${slot.time}</span>
        <span>${slot.is_booked ? `Booked by ${slot.patient_name}` : 'Available'}</span>
        ${actions}
      </div>`;
    }).join('');
  } catch (err) { showMessage(err.message, 'error'); }
}

async function deleteSlot(slotId) {
  if (!confirm('Delete this available slot?')) return;
  try { await api(`/api/slots/${slotId}`, 'DELETE'); showMessage('Slot deleted'); loadDoctorSchedule(); }
  catch (err) { showMessage(err.message, 'error'); }
}

async function cancelAppointmentByDoctor(id) {
  if (!confirm('Cancel this booked appointment?')) return;
  try { await api(`/api/doctor/appointments/${id}`, 'DELETE'); showMessage('Cancelled'); loadDoctorSchedule(); }
  catch (err) { showMessage(err.message, 'error'); }
}

// ---------- Doctor: clients ----------
async function loadAvailableClients() {
  try {
    const clients = await api('/api/clients/available');
    const c = document.getElementById('available-clients');
    if (!c) return;
    if (!clients.length) { c.innerHTML = '<p class="muted">No unassigned clients right now.</p>'; return; }
    c.innerHTML = `<div class="grid-cards">${clients.map(x => `
      <div class="service-card">
        <div class="service-icon">🧑</div>
        <h3>${x.name}</h3>
        <p>${x.email}</p>
        <p>${x.phone || 'No phone'}</p>
        <button onclick="assignClient(${x.id})">Take under my care</button>
      </div>
    `).join('')}</div>`;
  } catch (err) { showMessage(err.message, 'error'); }
}

async function assignClient(patientId) {
  if (!confirm('Take this client under your care?')) return;
  try {
    await api(`/api/clients/assign/${patientId}`, 'POST');
    showMessage('Client assigned');
    loadAvailableClients();
    loadMyClients();
  } catch (err) { showMessage(err.message, 'error'); }
}

async function loadMyClients() {
  try {
    const clients = await api('/api/clients/mine');
    const c = document.getElementById('my-clients');
    if (!c) return;
    if (!clients.length) { c.innerHTML = '<p class="muted">You have no clients yet.</p>'; return; }
    c.innerHTML = `<div class="grid-cards">${clients.map(x => `
      <div class="service-card">
        <div class="service-icon">🧑</div>
        <h3>${x.name}</h3>
        <p>${x.email}</p>
        <p>${x.phone || 'No phone'}</p>
        <button onclick="openChat(${x.id}, '${x.name.replace(/'/g, "\\'")}')">💬 Chat</button>
        <a href="tel:${x.phone || ''}" class="call-btn">📞 Call</a>
        <button class="video-btn" onclick="startVideoCall('${x.email}')">🎥 Video</button>
      </div>
    `).join('')}</div>`;
  } catch (err) { showMessage(err.message, 'error'); }
}

// ---------- Patient: doctors & appointments ----------
async function loadDoctors() {
  try {
    const doctors = await api('/api/doctors');
    const c = document.getElementById('doctors-list');
    if (!c) return;
    if (!doctors.length) { c.innerHTML = '<p>No doctors available.</p>'; return; }
    c.innerHTML = doctors.map(doc => `
      <div class="card">
        <h3>Dr. ${doc.name}</h3>
        <p>Email: ${doc.email}</p>
        <p>Phone: ${doc.phone || 'Not provided'}</p>
        <div>
          <a href="tel:${doc.phone}" class="call-btn">📞 Call</a>
          <button class="video-btn" onclick="startVideoCall('${doc.email}')">🎥 Video</button>
        </div>
        <button onclick="showAvailability(${doc.id}, '${doc.name.replace(/'/g, "\\'")}')">View Availability</button>
        <div id="availability-${doc.id}"></div>
      </div>
    `).join('');
  } catch (err) { showMessage(err.message, 'error'); }
}

async function showAvailability(doctorId, doctorName) {
  const c = document.getElementById(`availability-${doctorId}`);
  if (!c) return;
  try {
    const slots = await api(`/api/doctors/${doctorId}/availability`);
    if (!slots.length) { c.innerHTML = '<p>No available slots.</p>'; return; }
    c.innerHTML = `<h4>Available slots for Dr. ${doctorName}:</h4>
      <div class="grid">${slots.map(s => `
        <div class="slot"><span>${s.date} ${s.time}</span><button onclick="bookSlot(${s.id})">Book</button></div>
      `).join('')}</div>`;
  } catch (err) { c.innerHTML = `<span class="error">${err.message}</span>`; }
}

async function bookSlot(slotId) {
  try {
    await api('/api/book', 'POST', { slotId });
    showMessage('Appointment booked!');
    loadDoctors(); loadMyAppointments();
  } catch (err) { showMessage(err.message, 'error'); }
}

async function loadMyAppointments() {
  try {
    const list = await api('/api/patient/appointments');
    const c = document.getElementById('my-appointments');
    if (!c) return;
    if (!list.length) { c.innerHTML = '<p>No upcoming appointments.</p>'; return; }
    c.innerHTML = list.map(a => `
      <div class="slot booked">
        <span>${a.date} at ${a.time} with Dr. ${a.doctor_name}</span>
        <div>
          <a href="tel:${a.doctor_phone || ''}" class="call-btn">📞 Call</a>
          <button class="video-btn" onclick="startVideoCall('${a.doctor_email}')">🎥 Video</button>
          <button class="danger-btn" onclick="cancelAppointment(${a.id})">❌ Cancel</button>
        </div>
      </div>
    `).join('');
  } catch (err) { showMessage(err.message, 'error'); }
}

async function cancelAppointment(id) {
  if (!confirm('Cancel this appointment?')) return;
  try { await api(`/api/appointments/${id}`, 'DELETE'); showMessage('Cancelled'); loadMyAppointments(); loadDoctors(); }
  catch (err) { showMessage(err.message, 'error'); }
}

// ==================================================
//  CHAT
// ==================================================
async function loadMyTherapistChat() {
  try {
    const therapist = await api('/api/my-therapist');
    if (!therapist) {
      document.getElementById('chat-empty')?.classList.remove('hidden');
      document.getElementById('chat-box')?.classList.add('hidden');
      return;
    }
    document.getElementById('chat-empty')?.classList.add('hidden');
    document.getElementById('chat-box')?.classList.remove('hidden');
    document.getElementById('chat-with-name').textContent = `Dr. ${therapist.name}`;
    openChat(therapist.id, therapist.name);
  } catch (err) { showMessage(err.message, 'error'); }
}

async function openChat(otherId, otherName) {
  activeChatUserId = otherId;
  const box = document.getElementById('chat-box');
  const empty = document.getElementById('chat-empty');
  const nameEl = document.getElementById('chat-with-name');
  const messages = document.getElementById('chat-messages');

  if (box) box.classList.remove('hidden');
  if (empty) empty.classList.add('hidden');
  if (nameEl && otherName) nameEl.textContent = otherName;
  if (messages) messages.innerHTML = '<p class="muted">Loading…</p>';

  try {
    const list = await api(`/api/chat/messages/${otherId}`);
    messages.innerHTML = '';
    if (!list.length) {
      messages.innerHTML = '<p class="muted">No messages yet. Say hello 👋</p>';
    } else {
      list.forEach(m => appendMessage(m, true));
    }
    messages.scrollTop = messages.scrollHeight;
  } catch (err) {
    if (messages) messages.innerHTML = `<p class="error">${err.message}</p>`;
  }
}

function appendMessage(msg, skipScroll = false) {
  const c = document.getElementById('chat-messages');
  if (!c) return;
  const mine = msg.sender_id === currentUser.userId;
  const el = document.createElement('div');
  el.className = `chat-msg ${mine ? 'mine' : 'theirs'}`;
  const time = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  el.innerHTML = `<div class="bubble">${escapeHtml(msg.body)}</div><div class="meta">${time}</div>`;
  c.appendChild(el);
  if (!skipScroll) c.scrollTop = c.scrollHeight;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, s => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[s]));
}

let typingTimeout = null;
async function sendChatMessage(e) {
  e.preventDefault();
  const input = document.getElementById('chat-input');
  const body = input.value.trim();
  if (!body || !activeChatUserId) return;
  input.value = '';
  try {
    // send via REST (server will emit through Socket.IO to both sides)
    await api('/api/chat/messages', 'POST', { to: activeChatUserId, body });
  } catch (err) { showMessage(err.message, 'error'); }
}

// Typing indicator: broadcast on keystroke
document.addEventListener('input', (e) => {
  if (e.target && e.target.id === 'chat-input' && activeChatUserId && socket) {
    socket.emit('chat:typing', { to: activeChatUserId, isTyping: true });
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
      socket.emit('chat:typing', { to: activeChatUserId, isTyping: false });
    }, 1200);
  }
});

// ---------- Logout / Delete ----------
async function logout() {
  await api('/api/logout', 'POST');
  currentUser = null; activeChatUserId = null;
  if (socket) { socket.disconnect(); socket = null; }
  renderLanding();
}

async function deleteAccount() {
  if (!confirm('⚠️ Permanently delete your account and all data?')) return;
  try {
    await api('/api/account', 'DELETE');
    currentUser = null;
    if (socket) { socket.disconnect(); socket = null; }
    renderLanding();
  } catch (err) { showMessage(err.message, 'error'); }
}

// ---------- Start ----------
init();