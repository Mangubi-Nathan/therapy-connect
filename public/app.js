const app = document.getElementById('app');
let currentUser = null;
let slideshowTimer = null;
let socket = null;
let activeChatUserId = null;
let currentTab = 'overview';
let cachedProfile = null;
let typingTimeout = null;

// ---------- Helpers ----------
function showMessage(msg, type = 'success') {
  const div = document.createElement('div');
  div.className = `toast ${type}`;
  div.textContent = msg;
  document.body.appendChild(div);
  setTimeout(() => div.classList.add('show'), 10);
  setTimeout(() => { div.classList.remove('show'); setTimeout(() => div.remove(), 300); }, 3000);
}

async function api(url, method = 'GET', body = null) {
  const options = { method, headers: {} };
  if (body instanceof FormData) {
    options.body = body;
  } else if (body) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }
  const res = await fetch(url, options);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

function avatarUrl(pic, name = '') {
  if (pic) return `/uploads/${pic}`;
  const letter = (name || 'U').charAt(0).toUpperCase();
  const colors = ['#6366f1','#8b5cf6','#ec4899','#14b8a6','#f59e0b','#ef4444'];
  const idx = letter.charCodeAt(0) % colors.length;
  return `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="100%" height="100%" fill="${colors[idx]}"/><text x="50%" y="55%" font-size="40" fill="white" text-anchor="middle" dominant-baseline="middle" font-family="Arial" font-weight="bold">${letter}</text></svg>`
  )}`;
}

function fmtTime(ts) {
  const d = new Date(ts.endsWith?.('Z') ? ts : ts + 'Z');
  return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ---------- Session ----------
async function init() {
  try {
    const me = await api('/api/me');
    currentUser = me;
    setupSocket();
    requestNotificationPermission();
    renderApp();
  } catch {
    renderLanding();
  }
}

function setupSocket() {
  if (typeof io === 'undefined') return;
  if (socket) socket.disconnect();
  socket = io();

  socket.on('chat:message', (msg) => {
    if (activeChatUserId && (msg.sender_id === activeChatUserId || msg.receiver_id === activeChatUserId) && currentTab === 'chat') {
      appendMessage(msg);
    } else {
      showMessage('💬 New message received', 'success');
    }
    notify('New message', msg.body || '📎 Attachment');
  });

  socket.on('chat:typing', ({ from, isTyping }) => {
    const ind = document.getElementById('typing-indicator');
    if (ind && activeChatUserId === from) ind.textContent = isTyping ? 'typing…' : '';
  });

  socket.on('assignment:new', ({ doctorName }) => {
    showMessage(`👩‍⚕️ ${doctorName} is now your therapist!`, 'success');
    if (currentUser.role === 'patient') renderApp();
  });

  socket.on('video:invite', ({ from, fromName }) => {
    showMessage(`📹 ${fromName} is calling you…`, 'success');
    notify('📹 Incoming video call', `${fromName} is calling you`);
    if (currentUser.role === 'patient') loadMyTherapistChat();
    else loadMyClients();
  });
}

// ---------- Notifications ----------
function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    setTimeout(() => Notification.requestPermission(), 5000);
  }
}
function notify(title, body) {
  if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
    new Notification(title, { body, icon: '/favicon.ico' });
  }
}

// ==================================================
//  LANDING PAGE
// ==================================================
function renderLanding() {
  document.body.className = 'landing-mode';
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
  let i = 0;
  slideshowTimer = setInterval(() => {
    slides[i].classList.remove('active');
    i = (i + 1) % slides.length;
    slides[i].classList.add('active');
  }, 5000);
}
function stopSlideshow() { if (slideshowTimer) { clearInterval(slideshowTimer); slideshowTimer = null; } }
function scrollToTabs() { document.getElementById('tabs-section')?.scrollIntoView({ behavior: 'smooth' }); }

function showTab(name, event) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  if (event?.target) event.target.classList.add('active');
  const content = document.getElementById('tab-content');
  const renders = {
    services: renderServicesTab, plans: renderPlansTab, notices: renderNoticesTab,
    about: renderAboutTab, therapists: renderTherapistsTab, available: renderAvailableTab
  };
  content.innerHTML = renders[name] ? renders[name]() : '';
  if (name === 'therapists') loadTherapistsPreview();
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
  return `<div class="grid-cards">${s.map(x => `<div class="service-card"><div class="service-icon">${x.icon}</div><h3>${x.title}</h3><p>${x.desc}</p></div>`).join('')}</div>`;
}
function renderPlansTab() {
  const p = [
    { name: 'Starter', price: 'Free', features: ['Browse therapists', '1 session/month', 'Email support'] },
    { name: 'Standard', price: '$49/mo', features: ['4 sessions/month', 'Therapy chats', 'Priority booking', 'Video & phone'], featured: true },
    { name: 'Premium', price: '$99/mo', features: ['Unlimited sessions', 'Medication consults', '24/7 crisis', 'Dedicated therapist'] }
  ];
  return `<div class="plans-grid">${p.map(x => `<div class="plan-card ${x.featured ? 'featured' : ''}">${x.featured ? '<span class="badge">Most Popular</span>' : ''}<h3>${x.name}</h3><div class="price">${x.price}</div><ul>${x.features.map(f => `<li>✓ ${f}</li>`).join('')}</ul><button class="primary-btn" onclick="goToAuth('signup')">Choose ${x.name}</button></div>`).join('')}</div>`;
}
function renderNoticesTab() {
  const n = [
    { date: 'Aug 2026', title: 'New Therapists Joined', body: 'We have added 12 new licensed therapists.' },
    { date: 'Aug 2026', title: 'Extended Weekend Hours', body: 'Saturday sessions now 9 AM – 6 PM.' },
    { date: 'Jul 2026', title: 'Mental Health Awareness Month', body: 'Free consultations every Friday.' },
    { date: 'Jul 2026', title: 'New Chat Feature', body: 'Message your therapist securely.' }
  ];
  return `<div class="notices-list">${n.map(x => `<div class="notice-card"><div class="notice-date">${x.date}</div><h3>${x.title}</h3><p>${x.body}</p></div>`).join('')}</div>`;
}
function renderAboutTab() {
  return `<div class="about-content">
    <h2>About Therapy & Mental Health</h2>
    <p>Mental health is just as important as physical health. Therapy provides a safe, confidential space to explore your thoughts and feelings with a trained professional.</p>
    <h3>Why Therapy?</h3><p>Therapy helps you develop coping strategies and lead a more fulfilling life.</p>
    <h3>Our Mission</h3><p>Quality mental health care accessible to everyone.</p>
    <h3>Confidentiality</h3><p>All sessions are private and protected.</p>
    <div class="emergency-box">⚠️ <strong>In a crisis?</strong> Contact your local emergency services immediately.</div>
  </div>`;
}
function renderTherapistsTab() {
  return `<h2>Our Therapists</h2><p class="muted">Meet some of our licensed professionals.</p><div id="therapists-preview" class="grid-cards"><p>Loading…</p></div>`;
}
async function loadTherapistsPreview() {
  try {
    const docs = await api('/api/public/therapists');
    const c = document.getElementById('therapists-preview');
    if (!c) return;
    c.innerHTML = docs.length
      ? docs.map(d => `<div class="service-card"><div class="service-icon">👩‍⚕️</div><h3>Dr. ${escapeHtml(d.name)}</h3><p>Licensed Therapist</p></div>`).join('')
      : '<p class="muted">No therapists registered yet.</p>';
  } catch {}
}
function renderAvailableTab() {
  const items = [
    { icon: '🟢', title: 'Video Sessions', desc: 'Secure in-app video call.' },
    { icon: '🟢', title: 'Phone Sessions', desc: 'Direct call to your therapist.' },
    { icon: '🟢', title: 'Therapy Chats', desc: 'Secure messaging anytime.' },
    { icon: '🟢', title: 'Booking', desc: 'New slots daily.' },
    { icon: '🟡', title: 'Medication Consults', desc: 'Book in advance.' },
    { icon: '🟢', title: 'Crisis Support', desc: 'On-call 24/7.' }
  ];
  return `<h2>Currently Available</h2><div class="grid-cards">${items.map(x => `<div class="service-card"><div class="service-icon">${x.icon}</div><h3>${x.title}</h3><p>${x.desc}</p></div>`).join('')}</div>`;
}

function goToAuth(mode) {
  stopSlideshow();
  document.body.className = '';
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
    requestNotificationPermission();
    renderApp();
  } catch (err) { document.getElementById('login-error').textContent = err.message; }
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
    requestNotificationPermission();
    renderApp();
  } catch (err) { document.getElementById('signup-error').textContent = err.message; }
}

// ==================================================
//  DASHBOARD (tabbed)
// ==================================================
function renderApp() {
  if (!currentUser) return renderAuth();
  const isDoctor = currentUser.role === 'doctor';

  app.innerHTML = `
    <div class="shell">
      <header class="shell-header">
        <div class="shell-brand">🧠 Therapy Connect</div>
        <div class="shell-user">
          <img src="${avatarUrl(cachedProfile?.profile_pic, currentUser.name)}" class="avatar-sm" id="header-avatar">
          <span>${escapeHtml(currentUser.name)} · <em>${isDoctor ? 'Doctor' : 'Patient'}</em></span>
          <button class="ghost-dark" onclick="logout()">Logout</button>
        </div>
      </header>

      <nav class="shell-tabs">
        <button class="shell-tab ${currentTab === 'overview' ? 'active' : ''}" onclick="switchTab('overview')">🏠 Overview</button>
        <button class="shell-tab ${currentTab === 'appointments' ? 'active' : ''}" onclick="switchTab('appointments')">📅 Appointments</button>
        <button class="shell-tab ${currentTab === 'contacts' ? 'active' : ''}" onclick="switchTab('contacts')">${isDoctor ? '👥 Clients' : '👩‍⚕️ Doctors'}</button>
        <button class="shell-tab ${currentTab === 'chat' ? 'active' : ''}" onclick="switchTab('chat')">💬 Chat</button>
        <button class="shell-tab ${currentTab === 'profile' ? 'active' : ''}" onclick="switchTab('profile')">👤 Profile</button>
        <button class="shell-tab ${currentTab === 'activity' ? 'active' : ''}" onclick="switchTab('activity')">📜 Activity</button>
      </nav>

      <main class="shell-content" id="shell-content"></main>
    </div>
  `;
  loadProfile().then(() => {
    const img = document.getElementById('header-avatar');
    if (img) img.src = avatarUrl(cachedProfile?.profile_pic, currentUser.name);
  });
  renderTab();
}

function switchTab(name) {
  currentTab = name;
  document.querySelectorAll('.shell-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.shell-tab').forEach(t => {
    if (t.textContent.toLowerCase().includes(name === 'contacts' ? 'client' : name) ||
        (name === 'contacts' && t.textContent.includes('Doctor'))) t.classList.add('active');
  });
  renderTab();
}

function renderTab() {
  const c = document.getElementById('shell-content');
  if (!c) return;
  switch (currentTab) {
    case 'overview': c.innerHTML = renderOverviewTab(); loadOverviewData(); break;
    case 'appointments': c.innerHTML = renderAppointmentsTab(); currentUser.role === 'doctor' ? loadDoctorSchedule() : loadMyAppointments(); break;
    case 'contacts': c.innerHTML = renderContactsTab(); currentUser.role === 'doctor' ? (loadAvailableClients(), loadMyClients()) : loadDoctors(); break;
    case 'chat': c.innerHTML = renderChatTab(); currentUser.role === 'doctor' ? loadChatClients() : loadMyTherapistChat(); break;
    case 'profile': c.innerHTML = renderProfileTab(); loadProfile().then(fillProfileForm); break;
    case 'activity': c.innerHTML = renderActivityTab(); loadActivity(); break;
  }
}

// ---------- Overview ----------
function renderOverviewTab() {
  const isDoctor = currentUser.role === 'doctor';
  return `
    <div class="page-header">
      <h1>Welcome back, ${escapeHtml(currentUser.name)}</h1>
      <p class="muted">${isDoctor ? 'Manage your practice and connect with your clients.' : 'Your mental wellness journey at a glance.'}</p>
    </div>
    <div class="stats-grid" id="stats-grid">
      <div class="stat-card"><div class="stat-label">Loading…</div></div>
    </div>
  `;
}

async function loadOverviewData() {
  const grid = document.getElementById('stats-grid');
  if (!grid) return;
  try {
    if (currentUser.role === 'doctor') {
      const [schedule, clients] = await Promise.all([api('/api/doctor/schedule'), api('/api/clients/mine')]);
      const booked = schedule.filter(s => s.is_booked).length;
      const available = schedule.filter(s => !s.is_booked).length;
      grid.innerHTML = `
        <div class="stat-card"><div class="stat-value">${clients.length}</div><div class="stat-label">Clients</div></div>
        <div class="stat-card"><div class="stat-value">${booked}</div><div class="stat-label">Booked slots</div></div>
        <div class="stat-card"><div class="stat-value">${available}</div><div class="stat-label">Available slots</div></div>
        <div class="stat-card"><div class="stat-value">${schedule.length}</div><div class="stat-label">Total slots</div></div>
      `;
    } else {
      const [appts, therapist] = await Promise.all([api('/api/patient/appointments'), api('/api/my-therapist')]);
      grid.innerHTML = `
        <div class="stat-card"><div class="stat-value">${appts.length}</div><div class="stat-label">Upcoming appointments</div></div>
        <div class="stat-card"><div class="stat-value">${therapist ? '✓' : '—'}</div><div class="stat-label">Therapist assigned</div></div>
        <div class="stat-card"><div class="stat-value">${therapist ? escapeHtml(therapist.name) : 'None'}</div><div class="stat-label">Your therapist</div></div>
      `;
    }
  } catch { grid.innerHTML = '<p class="error">Failed to load stats.</p>'; }
}

// ---------- Appointments ----------
function renderAppointmentsTab() {
  const isDoctor = currentUser.role === 'doctor';
  if (isDoctor) {
    return `
      <div class="page-header"><h1>Appointments</h1></div>
      <div class="card">
        <h2>Add Available Slot</h2>
        <div class="row">
          <div><label>Date</label><input type="date" id="slot-date"></div>
          <div><label>Time</label><input type="time" id="slot-time"></div>
          <div class="row-btn"><button onclick="addSlot()">+ Add Slot</button></div>
        </div>
        <div id="add-slot-msg"></div>
      </div>
      <div class="card"><h2>My Schedule</h2><div id="doctor-schedule"></div></div>
    `;
  }
  return `
    <div class="page-header"><h1>My Appointments</h1></div>
    <div class="card"><div id="my-appointments"></div></div>
  `;
}

async function addSlot() {
  const date = document.getElementById('slot-date').value;
  const time = document.getElementById('slot-time').value;
  if (!date || !time) { showMessage('Please fill both fields', 'error'); return; }
  try {
    await api('/api/availability', 'POST', { date, time });
    showMessage('Slot added');
    loadDoctorSchedule();
  } catch (err) { showMessage(err.message, 'error'); }
}

async function loadDoctorSchedule() {
  const c = document.getElementById('doctor-schedule');
  if (!c) return;
  try {
    const slots = await api('/api/doctor/schedule');
    if (!slots.length) { c.innerHTML = '<p class="muted">No slots added yet.</p>'; return; }
    c.innerHTML = slots.map(s => `
      <div class="slot ${s.is_booked ? 'booked' : ''}">
        <div class="slot-info">
          <strong>${s.date} · ${s.time}</strong>
          ${s.is_booked ? `<div class="muted">Booked by ${escapeHtml(s.patient_name)}</div>` : '<div class="muted">Available</div>'}
        </div>
        <div class="slot-actions">
          ${s.is_booked
            ? `<button class="video-btn" onclick="startVideoCallWith(${JSON.stringify({ name: s.patient_name, room: null, otherId: null })})">🎥 Video</button>
               <button class="danger-btn" onclick="cancelAppointmentByDoctor(${s.id})">❌ Cancel</button>`
            : `<button class="danger-btn" onclick="deleteSlot(${s.id})">🗑 Delete</button>`}
        </div>
      </div>
    `).join('');
  } catch (err) { showMessage(err.message, 'error'); }
}

async function deleteSlot(id) {
  if (!confirm('Delete this slot?')) return;
  try { await api(`/api/slots/${id}`, 'DELETE'); showMessage('Deleted'); loadDoctorSchedule(); }
  catch (err) { showMessage(err.message, 'error'); }
}
async function cancelAppointmentByDoctor(id) {
  if (!confirm('Cancel this appointment?')) return;
  try { await api(`/api/doctor/appointments/${id}`, 'DELETE'); showMessage('Cancelled'); loadDoctorSchedule(); }
  catch (err) { showMessage(err.message, 'error'); }
}

// ---------- Patient: appointments ----------
async function loadMyAppointments() {
  const c = document.getElementById('my-appointments');
  if (!c) return;
  try {
    const list = await api('/api/patient/appointments');
    if (!list.length) { c.innerHTML = '<p class="muted">No upcoming appointments.</p>'; return; }
    c.innerHTML = list.map(a => `
      <div class="slot booked">
        <div class="slot-info">
          <strong>${a.date} · ${a.time}</strong>
          <div class="muted">with Dr. ${escapeHtml(a.doctor_name)}</div>
        </div>
        <div class="slot-actions">
          <button class="video-btn" onclick="startVideoCall('${escapeHtml(a.doctor_email)}')">🎥 Video</button>
          <button class="danger-btn" onclick="cancelAppointment(${a.id})">❌ Cancel</button>
        </div>
      </div>
    `).join('');
  } catch (err) { showMessage(err.message, 'error'); }
}

async function cancelAppointment(id) {
  if (!confirm('Cancel this appointment?')) return;
  try { await api(`/api/appointments/${id}`, 'DELETE'); showMessage('Cancelled'); loadMyAppointments(); }
  catch (err) { showMessage(err.message, 'error'); }
}

// ---------- Contacts ----------
function renderContactsTab() {
  const isDoctor = currentUser.role === 'doctor';
  if (isDoctor) {
    return `
      <div class="page-header"><h1>Clients</h1></div>
      <div class="card"><h2>🧑‍🤝‍🧑 My Clients</h2><div id="my-clients"></div></div>
      <div class="card"><h2>👥 Available Clients</h2><p class="muted">Pick a client to become their therapist.</p><div id="available-clients"></div></div>
    `;
  }
  return `
    <div class="page-header"><h1>Find a Doctor</h1></div>
    <div class="card"><div id="doctors-list"></div></div>
  `;
}

async function loadAvailableClients() {
  const c = document.getElementById('available-clients');
  if (!c) return;
  try {
    const list = await api('/api/clients/available');
    if (!list.length) { c.innerHTML = '<p class="muted">No unassigned clients.</p>'; return; }
    c.innerHTML = `<div class="grid-cards">${list.map(x => `
      <div class="person-card">
        <img src="${avatarUrl(x.profile_pic, x.name)}" class="avatar-md">
        <h3>${escapeHtml(x.name)}</h3>
        <p class="muted">${escapeHtml(x.email)}</p>
        ${x.bio ? `<p class="small">${escapeHtml(x.bio)}</p>` : ''}
        <button class="primary-btn" onclick="assignClient(${x.id})">Take under my care</button>
      </div>
    `).join('')}</div>`;
  } catch (err) { showMessage(err.message, 'error'); }
}

async function assignClient(pid) {
  if (!confirm('Take this client under your care?')) return;
  try {
    await api(`/api/clients/assign/${pid}`, 'POST');
    showMessage('Client assigned');
    loadAvailableClients(); loadMyClients();
  } catch (err) { showMessage(err.message, 'error'); }
}

async function loadMyClients() {
  const c = document.getElementById('my-clients');
  if (!c) return;
  try {
    const list = await api('/api/clients/mine');
    if (!list.length) { c.innerHTML = '<p class="muted">No clients yet.</p>'; return; }
    c.innerHTML = `<div class="grid-cards">${list.map(x => `
      <div class="person-card">
        <img src="${avatarUrl(x.profile_pic, x.name)}" class="avatar-md">
        <h3>${escapeHtml(x.name)}</h3>
        <p class="muted">${escapeHtml(x.email)}</p>
        ${x.phone ? `<p class="small">📞 ${escapeHtml(x.phone)}</p>` : ''}
        <div class="person-actions">
          <button onclick="openChatWith(${x.id}, '${escapeHtml(x.name).replace(/'/g, "\\'")}')">💬 Chat</button>
          <button class="video-btn" onclick="startRoomCall('${x.video_room}', '${escapeHtml(x.name).replace(/'/g, "\\'")}', ${x.id})">🎥 Video</button>
        </div>
      </div>
    `).join('')}</div>`;
  } catch (err) { showMessage(err.message, 'error'); }
}

async function loadDoctors() {
  const c = document.getElementById('doctors-list');
  if (!c) return;
  try {
    const doctors = await api('/api/doctors');
    if (!doctors.length) { c.innerHTML = '<p class="muted">No doctors available.</p>'; return; }
    c.innerHTML = `<div class="grid-cards">${doctors.map(d => `
      <div class="person-card">
        <img src="${avatarUrl(d.profile_pic, d.name)}" class="avatar-md">
        <h3>Dr. ${escapeHtml(d.name)}</h3>
        <p class="muted">${escapeHtml(d.email)}</p>
        ${d.phone ? `<p class="small">📞 ${escapeHtml(d.phone)}</p>` : ''}
        ${d.bio ? `<p class="small">${escapeHtml(d.bio)}</p>` : ''}
        <div class="person-actions">
          <button onclick="showAvailability(${d.id}, '${escapeHtml(d.name).replace(/'/g, "\\'")}')">📅 Availability</button>
        </div>
        <div id="availability-${d.id}"></div>
      </div>
    `).join('')}</div>`;
  } catch (err) { showMessage(err.message, 'error'); }
}

async function showAvailability(doctorId, doctorName) {
  const c = document.getElementById(`availability-${doctorId}`);
  if (!c) return;
  try {
    const slots = await api(`/api/doctors/${doctorId}/availability`);
    if (!slots.length) { c.innerHTML = '<p class="muted">No slots.</p>'; return; }
    c.innerHTML = `<div class="grid-mini">${slots.map(s => `<div class="slot-mini"><span>${s.date} ${s.time}</span><button onclick="bookSlot(${s.id})">Book</button></div>`).join('')}</div>`;
  } catch (err) { c.innerHTML = `<span class="error">${err.message}</span>`; }
}

async function bookSlot(slotId) {
  try {
    await api('/api/book', 'POST', { slotId });
    showMessage('Appointment booked!');
    renderTab();
  } catch (err) { showMessage(err.message, 'error'); }
}

// ---------- Chat ----------
function renderChatTab() {
  const isDoctor = currentUser.role === 'doctor';
  if (isDoctor) {
    return `
      <div class="page-header"><h1>Messages</h1><p class="muted">Chat confidentially with your clients.</p></div>
      <div class="chat-layout">
        <aside class="chat-sidebar" id="chat-sidebar"><p class="muted">Loading…</p></aside>
        <section class="chat-panel" id="chat-panel">
          <div class="chat-empty">Select a client to start chatting.</div>
        </section>
      </div>
    `;
  }
  return `
    <div class="page-header"><h1>Chat with My Therapist</h1></div>
    <div class="chat-layout single">
      <section class="chat-panel" id="chat-panel">
        <div class="chat-empty">Loading…</div>
      </section>
    </div>
  `;
}

async function loadChatClients() {
  const sb = document.getElementById('chat-sidebar');
  if (!sb) return;
  try {
    const list = await api('/api/clients/mine');
    if (!list.length) { sb.innerHTML = '<p class="muted">No clients yet.</p>'; return; }
    sb.innerHTML = list.map(x => `
      <button class="chat-contact" onclick="openChatWith(${x.id}, '${escapeHtml(x.name).replace(/'/g, "\\'")}', '${x.video_room}')">
        <img src="${avatarUrl(x.profile_pic, x.name)}" class="avatar-sm">
        <div><strong>${escapeHtml(x.name)}</strong><div class="muted small">${escapeHtml(x.email)}</div></div>
      </button>
    `).join('');
  } catch (err) { sb.innerHTML = `<p class="error">${err.message}</p>`; }
}

async function loadMyTherapistChat() {
  const panel = document.getElementById('chat-panel');
  if (!panel) return;
  try {
    const therapist = await api('/api/my-therapist');
    if (!therapist) { panel.innerHTML = '<div class="chat-empty">You don\'t have a therapist yet. A therapist will pick you up soon.</div>'; return; }
    openChatWith(therapist.id, therapist.name, therapist.video_room);
  } catch (err) { panel.innerHTML = `<p class="error">${err.message}</p>`; }
}

async function openChatWith(otherId, otherName, videoRoom = null) {
  activeChatUserId = otherId;
  const panel = document.getElementById('chat-panel');
  if (!panel) return;

  panel.innerHTML = `
    <div class="chat-header">
      <div class="chat-header-info">
        <img src="${avatarUrl(null, otherName)}" class="avatar-sm">
        <div>
          <strong>${escapeHtml(otherName)}</strong>
          <div id="typing-indicator" class="typing"></div>
        </div>
      </div>
      <div class="chat-header-actions">
        ${videoRoom ? `<button class="video-btn" onclick="startRoomCall('${videoRoom}', '${escapeHtml(otherName).replace(/'/g, "\\'")}', ${otherId})">🎥 Video Call</button>` : ''}
      </div>
    </div>
    <div id="chat-messages" class="chat-messages"><p class="muted">Loading…</p></div>
    <form class="chat-input-bar" onsubmit="sendChatMessage(event)">
      <label class="attach-btn" title="Attach file">
        📎
        <input type="file" id="chat-file" hidden onchange="onChatFileSelected(event)">
      </label>
      <input type="text" id="chat-input" placeholder="Type a message…" autocomplete="off">
      <button type="submit">Send</button>
    </form>
    <div id="pending-attachment" class="pending-attachment hidden"></div>
  `;

  try {
    const list = await api(`/api/chat/messages/${otherId}`);
    const c = document.getElementById('chat-messages');
    c.innerHTML = '';
    if (!list.length) c.innerHTML = '<p class="muted center">No messages yet. Say hello 👋</p>';
    else list.forEach(m => appendMessage(m, true));
    c.scrollTop = c.scrollHeight;
  } catch (err) {
    document.getElementById('chat-messages').innerHTML = `<p class="error">${err.message}</p>`;
  }
}

let pendingAttachment = null;

async function onChatFileSelected(e) {
  const file = e.target.files[0];
  if (!file) return;
  const fd = new FormData();
  fd.append('file', file);
  try {
    const res = await api('/api/upload', 'POST', fd);
    pendingAttachment = res;
    const p = document.getElementById('pending-attachment');
    p.classList.remove('hidden');
    p.innerHTML = res.type === 'image'
      ? `📷 <img src="${res.url}" class="preview-img"> <button type="button" onclick="clearAttachment()">✕</button>`
      : `📎 ${escapeHtml(res.name)} <button type="button" onclick="clearAttachment()">✕</button>`;
  } catch (err) { showMessage(err.message, 'error'); }
}

function clearAttachment() {
  pendingAttachment = null;
  const p = document.getElementById('pending-attachment');
  if (p) { p.classList.add('hidden'); p.innerHTML = ''; }
}

function appendMessage(msg, skipScroll = false) {
  const c = document.getElementById('chat-messages');
  if (!c) return;
  const mine = msg.sender_id === currentUser.userId;
  const el = document.createElement('div');
  el.className = `chat-msg ${mine ? 'mine' : 'theirs'}`;

  let content = '';
  if (msg.body) content += `<div class="bubble">${escapeHtml(msg.body)}</div>`;
  if (msg.attachment) {
    if (msg.attachment_type === 'image') {
      content += `<div class="bubble attachment"><img src="/uploads/${msg.attachment}" class="chat-img" onclick="window.open('/uploads/${msg.attachment}','_blank')"></div>`;
    } else {
      content += `<div class="bubble attachment"><a href="/uploads/${msg.attachment}" target="_blank" download>📎 ${escapeHtml(msg.attachment_name || 'File')}</a></div>`;
    }
  }

  el.innerHTML = `${content}<div class="meta">${fmtTime(msg.created_at)}</div>`;
  c.appendChild(el);
  if (!skipScroll) c.scrollTop = c.scrollHeight;
}

async function sendChatMessage(e) {
  e.preventDefault();
  const input = document.getElementById('chat-input');
  const body = input.value.trim();
  if (!body && !pendingAttachment) return;
  if (!activeChatUserId) return;
  const payload = { to: activeChatUserId, body };
  if (pendingAttachment) {
    payload.attachment = pendingAttachment.filename;
    payload.attachment_type = pendingAttachment.type;
    payload.attachment_name = pendingAttachment.name;
  }
  input.value = '';
  clearAttachment();
  try {
    await api('/api/chat/messages', 'POST', payload);
  } catch (err) { showMessage(err.message, 'error'); }
}

document.addEventListener('input', (e) => {
  if (e.target && e.target.id === 'chat-input' && activeChatUserId && socket) {
    socket.emit('chat:typing', { to: activeChatUserId, isTyping: true });
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => socket.emit('chat:typing', { to: activeChatUserId, isTyping: false }), 1200);
  }
});

// ---------- Video calling ----------
function startRoomCall(room, otherName, otherId) {
  if (!room) return showMessage('Video room not available', 'error');
  if (socket && otherId) socket.emit('video:invite', { to: otherId });
  openVideoModal(room, otherName);
}

function openVideoModal(room, otherName) {
  const modal = document.createElement('div');
  modal.className = 'video-modal';
  modal.innerHTML = `
    <div class="video-modal-content">
      <div class="video-modal-header">
        <span>🎥 Secure call with ${escapeHtml(otherName || '')}</span>
        <button onclick="closeVideoModal()">✕</button>
      </div>
      <iframe src="https://meet.jit.si/${encodeURIComponent(room)}#config.prejoinPageEnabled=false&userInfo.displayName=%22Therapy%20User%22"
        allow="camera; microphone; fullscreen; display-capture; autoplay; clipboard-write"></iframe>
    </div>
  `;
  document.body.appendChild(modal);
  setTimeout(() => modal.classList.add('show'), 10);
}

function closeVideoModal() {
  const m = document.querySelector('.video-modal');
  if (m) { m.classList.remove('show'); setTimeout(() => m.remove(), 200); }
}

// ---------- Profile ----------
function renderProfileTab() {
  return `
    <div class="page-header"><h1>My Profile</h1></div>
    <div class="card profile-card">
      <div class="profile-avatar-wrap">
        <img id="profile-preview" src="" class="profile-avatar">
        <div class="avatar-actions">
          <label class="primary-btn small">
            Change Picture
            <input type="file" accept="image/*" hidden onchange="uploadProfilePic(event)">
          </label>
          <button class="danger-btn small" onclick="removeProfilePic()">Remove</button>
        </div>
      </div>
      <div class="profile-form">
        <label>Full Name</label>
        <input type="text" id="profile-name">
        <label>Email (cannot change)</label>
        <input type="email" id="profile-email" disabled>
        <label>Phone</label>
        <input type="tel" id="profile-phone">
        <label>About me</label>
        <textarea id="profile-bio" rows="4" placeholder="A short bio…"></textarea>
        <button class="primary-btn" onclick="saveProfile()">Save Changes</button>
      </div>
    </div>
  `;
}

async function loadProfile() {
  try {
    cachedProfile = await api('/api/profile');
  } catch {}
  return cachedProfile;
}

function fillProfileForm() {
  if (!cachedProfile) return;
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
  set('profile-name', cachedProfile.name);
  set('profile-email', cachedProfile.email);
  set('profile-phone', cachedProfile.phone);
  set('profile-bio', cachedProfile.bio);
  const prev = document.getElementById('profile-preview');
  if (prev) prev.src = avatarUrl(cachedProfile.profile_pic, cachedProfile.name);
}

async function saveProfile() {
  const name = document.getElementById('profile-name').value.trim();
  const phone = document.getElementById('profile-phone').value.trim();
  const bio = document.getElementById('profile-bio').value.trim();
  try {
    await api('/api/profile', 'PUT', { name, phone, bio });
    currentUser.name = name;
    cachedProfile.name = name;
    showMessage('Profile updated');
    const headerAv = document.getElementById('header-avatar');
    if (headerAv) headerAv.src = avatarUrl(cachedProfile.profile_pic, name);
  } catch (err) { showMessage(err.message, 'error'); }
}

async function uploadProfilePic(e) {
  const file = e.target.files[0];
  if (!file) return;
  const fd = new FormData();
  fd.append('picture', file);
  try {
    const res = await api('/api/profile/picture', 'POST', fd);
    cachedProfile.profile_pic = res.filename;
    document.getElementById('profile-preview').src = `/uploads/${res.filename}?t=${Date.now()}`;
    const headerAv = document.getElementById('header-avatar');
    if (headerAv) headerAv.src = `/uploads/${res.filename}?t=${Date.now()}`;
    showMessage('Picture updated');
  } catch (err) { showMessage(err.message, 'error'); }
}

async function removeProfilePic() {
  if (!confirm('Remove profile picture?')) return;
  try {
    await api('/api/profile/picture', 'DELETE');
    cachedProfile.profile_pic = null;
    document.getElementById('profile-preview').src = avatarUrl(null, cachedProfile.name);
    const headerAv = document.getElementById('header-avatar');
    if (headerAv) headerAv.src = avatarUrl(null, cachedProfile.name);
    showMessage('Picture removed');
  } catch (err) { showMessage(err.message, 'error'); }
}

// ---------- Activity ----------
function renderActivityTab() {
  return `
    <div class="page-header"><h1>Activity Log</h1><p class="muted">${currentUser.role === 'doctor' ? 'Your activity and your clients\' activity.' : 'Your personal activity history.'}</p></div>
    <div class="card"><div id="activity-list"><p class="muted">Loading…</p></div></div>
  `;
}

async function loadActivity() {
  const c = document.getElementById('activity-list');
  if (!c) return;
  try {
    const rows = await api('/api/activity');
    if (!rows.length) { c.innerHTML = '<p class="muted">No activity yet.</p>'; return; }
    c.innerHTML = rows.map(r => `
      <div class="activity-row">
        <div class="activity-dot"></div>
        <div class="activity-body">
          <div class="activity-action">${escapeHtml(prettyAction(r.action))}</div>
          ${r.details ? `<div class="muted small">${escapeHtml(r.details)}</div>` : ''}
          <div class="muted tiny">${escapeHtml(r.user_name)} · ${fmtTime(r.created_at)}</div>
        </div>
      </div>
    `).join('');
  } catch (err) { c.innerHTML = `<p class="error">${err.message}</p>`; }
}

function prettyAction(a) {
  return ({
    signup: '✍️ Signed up',
    login: '🔓 Logged in',
    logout: '🔒 Logged out',
    slot_added: '➕ Added availability slot',
    slot_deleted: '🗑 Deleted availability slot',
    appointment_booked: '📅 Booked appointment',
    appointment_cancelled: '❌ Cancelled appointment',
    client_assigned: '🤝 Took on a new client',
    assigned: '🎉 Assigned to a therapist',
    message_sent: '💬 Sent a message',
    profile_update: '✏️ Updated profile',
    profile_pic: '🖼 Updated profile picture'
  })[a] || a;
}

// ---------- Logout / Delete ----------
async function logout() {
  await api('/api/logout', 'POST');
  currentUser = null; activeChatUserId = null; currentTab = 'overview';
  if (socket) { socket.disconnect(); socket = null; }
  renderLanding();
}

// ---------- Start ----------
init();