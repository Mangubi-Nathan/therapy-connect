const app = document.getElementById('app');
let currentUser = null;
let slideshowTimer = null;

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

// ---------- Check session on load ----------
async function init() {
  try {
    const me = await api('/api/me');
    currentUser = me;
    renderDashboard();
  } catch {
    renderLanding(); // ← Show landing page instead of auth directly
  }
}

// ==================================================
//  LANDING PAGE
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
          <div class="tabs" id="landing-tabs">
            <button class="tab active" onclick="showTab('services', event)">Services</button>
            <button class="tab" onclick="showTab('plans', event)">Treatment Plans</button>
            <button class="tab" onclick="showTab('notices', event)">Notices</button>
            <button class="tab" onclick="showTab('about', event)">About</button>
            <button class="tab" onclick="showTab('therapists', event)">Therapists</button>
            <button class="tab" onclick="showTab('available', event)">Available Now</button>
          </div>
          <div class="tab-content" id="tab-content">
            ${renderServicesTab()}
          </div>
        </section>

        <footer class="landing-footer">
          <p>© ${new Date().getFullYear()} Therapy Connect · Confidential &amp; Secure · Emergency: call your local helpline</p>
        </footer>
      </div>
    </div>
  `;
  startSlideshow();
}

function startSlideshow() {
  const slides = document.querySelectorAll('.slide');
  if (slides.length === 0) return;
  if (slideshowTimer) clearInterval(slideshowTimer);

  let index = 0;
  slideshowTimer = setInterval(() => {
    slides[index].classList.remove('active');
    index = (index + 1) % slides.length;
    slides[index].classList.add('active');
  }, 5000);
}

function stopSlideshow() {
  if (slideshowTimer) {
    clearInterval(slideshowTimer);
    slideshowTimer = null;
  }
}

function scrollToTabs() {
  const el = document.getElementById('tabs-section');
  if (el) el.scrollIntoView({ behavior: 'smooth' });
}

function showTab(name, event) {
  // Highlight active tab
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  if (event && event.target) event.target.classList.add('active');

  const content = document.getElementById('tab-content');
  switch (name) {
    case 'services':    content.innerHTML = renderServicesTab(); break;
    case 'plans':       content.innerHTML = renderPlansTab(); break;
    case 'notices':     content.innerHTML = renderNoticesTab(); break;
    case 'about':       content.innerHTML = renderAboutTab(); break;
    case 'therapists':  content.innerHTML = renderTherapistsTab(); loadTherapistsPreview(); break;
    case 'available':   content.innerHTML = renderAvailableTab(); break;
  }
}

// ---------- Tab Contents ----------
function renderServicesTab() {
  const services = [
    { icon: '💬', title: 'Individual Therapy', desc: 'One-on-one sessions with a licensed therapist tailored to your needs.' },
    { icon: '💑', title: 'Couples Counselling', desc: 'Strengthen your relationship with guided sessions for partners.' },
    { icon: '👨‍👩‍👧', title: 'Family Therapy', desc: 'Work through family dynamics in a safe, supportive environment.' },
    { icon: '👥', title: 'Group Therapy', desc: 'Connect with others facing similar challenges in guided group sessions.' },
    { icon: '💊', title: 'Medication Prescription', desc: 'Consult with psychiatrists for evaluation and prescription support.' },
    { icon: '📱', title: 'Therapy Chats', desc: 'Message your therapist securely between sessions for ongoing support.' },
    { icon: '🚨', title: 'Crisis Support', desc: 'Immediate help during difficult moments — trained counsellors on call.' },
    { icon: '🧘', title: 'Mindfulness & Wellness', desc: 'Guided meditation, breathing exercises, and stress-management tools.' }
  ];
  return `
    <div class="grid-cards">
      ${services.map(s => `
        <div class="service-card">
          <div class="service-icon">${s.icon}</div>
          <h3>${s.title}</h3>
          <p>${s.desc}</p>
        </div>
      `).join('')}
    </div>
  `;
}

function renderPlansTab() {
  const plans = [
    { name: 'Starter', price: 'Free', features: ['Browse therapists', 'Book 1 session/month', 'Email support'] },
    { name: 'Standard', price: '$49/mo', features: ['4 sessions/month', 'Therapy chats', 'Priority booking', 'Video & phone calls'], featured: true },
    { name: 'Premium', price: '$99/mo', features: ['Unlimited sessions', 'Medication consults', '24/7 crisis support', 'Dedicated therapist'] }
  ];
  return `
    <div class="plans-grid">
      ${plans.map(p => `
        <div class="plan-card ${p.featured ? 'featured' : ''}">
          ${p.featured ? '<span class="badge">Most Popular</span>' : ''}
          <h3>${p.name}</h3>
          <div class="price">${p.price}</div>
          <ul>
            ${p.features.map(f => `<li>✓ ${f}</li>`).join('')}
          </ul>
          <button class="primary-btn" onclick="goToAuth('signup')">Choose ${p.name}</button>
        </div>
      `).join('')}
    </div>
  `;
}

function renderNoticesTab() {
  const notices = [
    { date: 'Aug 2026', title: 'New Therapists Joined', body: 'We have added 12 new licensed therapists to our platform this month.' },
    { date: 'Aug 2026', title: 'Extended Weekend Hours', body: 'Saturday sessions are now available from 9 AM – 6 PM.' },
    { date: 'Jul 2026', title: 'Mental Health Awareness Month', body: 'Free consultation sessions every Friday throughout July.' },
    { date: 'Jul 2026', title: 'New Chat Feature', body: 'You can now message your therapist securely between sessions.' }
  ];
  return `
    <div class="notices-list">
      ${notices.map(n => `
        <div class="notice-card">
          <div class="notice-date">${n.date}</div>
          <h3>${n.title}</h3>
          <p>${n.body}</p>
        </div>
      `).join('')}
    </div>
  `;
}

function renderAboutTab() {
  return `
    <div class="about-content">
      <h2>About Therapy & Mental Health</h2>
      <p>Mental health is just as important as physical health. Therapy provides a safe, confidential space to explore your thoughts, feelings, and challenges with a trained professional.</p>

      <h3>Why Therapy?</h3>
      <p>Whether you're dealing with anxiety, depression, stress, relationship issues, or simply want to understand yourself better, therapy can help you develop coping strategies and lead a more fulfilling life.</p>

      <h3>Our Mission</h3>
      <p>Therapy Connect makes quality mental health care accessible to everyone — with licensed therapists, flexible schedules, and secure video, phone, and chat sessions.</p>

      <h3>Confidentiality</h3>
      <p>All sessions are private and protected. Your information is never shared without your explicit consent, except where required by law.</p>

      <div class="emergency-box">
        ⚠️ <strong>In a crisis?</strong> If you or someone you know is in immediate danger, please contact your local emergency services (e.g., 911, 999, 112) or a suicide prevention hotline immediately.
      </div>
    </div>
  `;
}

function renderTherapistsTab() {
  return `
    <h2>Our Therapists</h2>
    <p class="muted">Meet some of our licensed professionals. Log in to see full profiles and book a session.</p>
    <div id="therapists-preview" class="grid-cards">
      <p>Loading therapists…</p>
    </div>
    <div style="margin-top:20px;text-align:center;">
      <button class="primary-btn" onclick="goToAuth('signup')">Join to see all therapists →</button>
    </div>
  `;
}

async function loadTherapistsPreview() {
  try {
    const docs = await api('/api/public/therapists');
    const container = document.getElementById('therapists-preview');
    if (!container) return;
    if (docs.length === 0) {
      container.innerHTML = '<p class="muted">No therapists registered yet.</p>';
      return;
    }
    container.innerHTML = docs.map(d => `
      <div class="service-card">
        <div class="service-icon">👩‍⚕️</div>
        <h3>Dr. ${d.name}</h3>
        <p>Licensed Therapist</p>
      </div>
    `).join('');
  } catch (err) {
    const container = document.getElementById('therapists-preview');
    if (container) container.innerHTML = '<p class="muted">Could not load therapists.</p>';
  }
}

function renderAvailableTab() {
  const items = [
    { icon: '🟢', title: 'Video Sessions', desc: 'Available now — start an instant Google Meet call.' },
    { icon: '🟢', title: 'Phone Sessions', desc: 'Direct call to your therapist\'s phone number.' },
    { icon: '🟢', title: 'Therapy Chats', desc: 'Send a secure message anytime.' },
    { icon: '🟢', title: 'Booking', desc: 'New appointment slots added daily.' },
    { icon: '🟡', title: 'Medication Consults', desc: 'Limited availability — book in advance.' },
    { icon: '🟢', title: 'Crisis Support', desc: 'On-call counsellors available 24/7.' }
  ];
  return `
    <h2>Currently Available Services</h2>
    <div class="grid-cards">
      ${items.map(i => `
        <div class="service-card">
          <div class="service-icon">${i.icon}</div>
          <h3>${i.title}</h3>
          <p>${i.desc}</p>
        </div>
      `).join('')}
    </div>
    <div style="margin-top:20px;text-align:center;">
      <button class="primary-btn" onclick="goToAuth('login')">Log in to book now</button>
    </div>
  `;
}

// ---------- Navigate to Auth from Landing ----------
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
    <label>Unique Code (Doctor: starts with "Doc", Patient: starts with "Pt")</label>
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
  } else {
    loadDoctors();
    loadMyAppointments();
  }
}

function renderDoctorDashboard() {
  return `
    <div class="card">
      <h2>Add Available Slot</h2>
      <label>Date:</label>
      <input type="date" id="slot-date">
      <label>Time:</label>
      <input type="time" id="slot-time">
      <button onclick="addSlot()">Add Slot</button>
      <div id="add-slot-msg"></div>
    </div>
    <div class="card">
      <h2>My Schedule</h2>
      <div id="doctor-schedule"></div>
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
  `;
}

// ---------- Video call ----------
function startVideoCall(recipientEmail) {
  window.open('https://meet.google.com/new', '_blank');
  const subject = encodeURIComponent('Video Call Invitation');
  const body = encodeURIComponent('Join my Google Meet call:\nhttps://meet.google.com/new');
  window.open(`mailto:${recipientEmail}?subject=${subject}&body=${body}`, '_blank');
}

// ---------- Doctor Functions ----------
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
    const container = document.getElementById('doctor-schedule');
    if (!container) return;
    if (slots.length === 0) {
      container.innerHTML = '<p>No slots added yet.</p>';
      return;
    }
    container.innerHTML = slots.map(slot => {
      let actions = '';
      if (slot.is_booked && slot.patient_name) {
        const phone = slot.patient_phone || '';
        actions = `
          <div>
            <a href="tel:${phone}" class="call-btn">📞 Call</a>
            <button class="video-btn" onclick="startVideoCall('${slot.patient_email}')">🎥 Video</button>
            <button class="danger-btn" onclick="cancelAppointmentByDoctor(${slot.id})">❌ Cancel</button>
          </div>
        `;
      } else if (!slot.is_booked) {
        actions = `<div><button class="danger-btn" onclick="deleteSlot(${slot.id})">🗑️ Delete</button></div>`;
      }
      return `
        <div class="slot ${slot.is_booked ? 'booked' : ''}">
          <span>${slot.date} at ${slot.time}</span>
          <span>${slot.is_booked ? `Booked by ${slot.patient_name}` : 'Available'}</span>
          ${actions}
        </div>
      `;
    }).join('');
  } catch (err) {
    showMessage(err.message, 'error');
  }
}

async function deleteSlot(slotId) {
  if (!confirm('Delete this available slot?')) return;
  try {
    await api(`/api/slots/${slotId}`, 'DELETE');
    showMessage('Slot deleted');
    loadDoctorSchedule();
  } catch (err) { showMessage(err.message, 'error'); }
}

async function cancelAppointmentByDoctor(appointmentId) {
  if (!confirm('Cancel this booked appointment?')) return;
  try {
    await api(`/api/doctor/appointments/${appointmentId}`, 'DELETE');
    showMessage('Appointment cancelled');
    loadDoctorSchedule();
  } catch (err) { showMessage(err.message, 'error'); }
}

// ---------- Patient Functions ----------
async function loadDoctors() {
  try {
    const doctors = await api('/api/doctors');
    const container = document.getElementById('doctors-list');
    if (!container) return;
    if (doctors.length === 0) {
      container.innerHTML = '<p>No doctors available.</p>';
      return;
    }
    container.innerHTML = doctors.map(doc => `
      <div class="card">
        <h3>Dr. ${doc.name}</h3>
        <p>Email: ${doc.email}</p>
        <p>Phone: ${doc.phone || 'Not provided'}</p>
        <div>
          <a href="tel:${doc.phone}" class="call-btn">📞 Call</a>
          <button class="video-btn" onclick="startVideoCall('${doc.email}')">🎥 Video</button>
        </div>
        <button onclick="showAvailability(${doc.id}, '${doc.name}')">View Availability</button>
        <div id="availability-${doc.id}"></div>
      </div>
    `).join('');
  } catch (err) { showMessage(err.message, 'error'); }
}

async function showAvailability(doctorId, doctorName) {
  const container = document.getElementById(`availability-${doctorId}`);
  if (!container) return;
  try {
    const slots = await api(`/api/doctors/${doctorId}/availability`);
    if (slots.length === 0) {
      container.innerHTML = '<p>No available slots.</p>';
      return;
    }
    container.innerHTML = `
      <h4>Available slots for Dr. ${doctorName}:</h4>
      <div class="grid">
        ${slots.map(slot => `
          <div class="slot">
            <span>${slot.date} ${slot.time}</span>
            <button onclick="bookSlot(${slot.id})">Book</button>
          </div>
        `).join('')}
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<span class="error">${err.message}</span>`;
  }
}

async function bookSlot(slotId) {
  try {
    await api('/api/book', 'POST', { slotId });
    showMessage('Appointment booked successfully!');
    loadDoctors();
    loadMyAppointments();
  } catch (err) { showMessage(err.message, 'error'); }
}

async function loadMyAppointments() {
  try {
    const appointments = await api('/api/patient/appointments');
    const container = document.getElementById('my-appointments');
    if (!container) return;
    if (appointments.length === 0) {
      container.innerHTML = '<p>You have no upcoming appointments.</p>';
      return;
    }
    container.innerHTML = appointments.map(appt => `
      <div class="slot booked">
        <span>${appt.date} at ${appt.time} with Dr. ${appt.doctor_name}</span>
        <span>Contact: ${appt.doctor_email} / ${appt.doctor_phone || 'N/A'}</span>
        <div>
          <a href="tel:${appt.doctor_phone}" class="call-btn">📞 Call</a>
          <button class="video-btn" onclick="startVideoCall('${appt.doctor_email}')">🎥 Video</button>
          <button class="danger-btn" onclick="cancelAppointment(${appt.id})">❌ Cancel</button>
        </div>
      </div>
    `).join('');
  } catch (err) { showMessage(err.message, 'error'); }
}

async function cancelAppointment(appointmentId) {
  if (!confirm('Cancel this appointment?')) return;
  try {
    await api(`/api/appointments/${appointmentId}`, 'DELETE');
    showMessage('Appointment cancelled');
    loadMyAppointments();
    loadDoctors();
  } catch (err) { showMessage(err.message, 'error'); }
}

// ---------- Logout & Account ----------
async function logout() {
  await api('/api/logout', 'POST');
  currentUser = null;
  renderLanding();
}

async function deleteAccount() {
  if (!confirm('⚠️ This will permanently delete your account and all your appointments. Continue?')) return;
  try {
    await api('/api/account', 'DELETE');
    showMessage('Account deleted successfully');
    currentUser = null;
    renderLanding();
  } catch (err) { showMessage(err.message, 'error'); }
}

// ---------- Start ----------
init();