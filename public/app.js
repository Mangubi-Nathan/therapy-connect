const app = document.getElementById('app');
let currentUser = null;

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

// ---------- Check session ----------
async function init() {
  try {
    const me = await api('/api/me');
    currentUser = me;
    renderDashboard();
  } catch {
    renderAuth();
  }
}

// ---------- Auth ----------
function renderAuth() {
  app.innerHTML = `
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
    <!-- NEW: Unique Code field -->
    <label>Unique Code (Doctor codes start with 'Doc', Patient codes with 'Pt')</label>
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
  const code = document.getElementById('signup-code').value;   // NEW
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

// ---------- Dashboard ----------
function renderDashboard() {
  if (!currentUser) return renderAuth();

  const isDoctor = currentUser.role === 'doctor';
  app.innerHTML = `
    <button class="logout-btn" onclick="logout()">Logout</button>
    <button class="danger-btn" onclick="deleteAccount()" style="position:absolute; top:70px; right:20px;">Delete Account</button>
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
async function deleteAccount() {
  if (!confirm('This will permanently delete your account and all appointments. Continue?')) return;
  try {
    await api('/api/account', 'DELETE');
    showMessage('Account deleted');
    currentUser = null;
    renderAuth();
  } catch (err) {
    showMessage(err.message, 'error');
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

// ---------- Video Call Helper ----------
function startVideoCall(recipientEmail) {
  // Open Google Meet in a new tab
  window.open('https://meet.google.com/new', '_blank');

  // Open email client with recipient, subject, and body containing the Meet link
  const subject = encodeURIComponent('Video Call Invitation');
  const body = encodeURIComponent(
    'Join my Google Meet call:\nhttps://meet.google.com/new'
  );
  window.open(
    `mailto:${recipientEmail}?subject=${subject}&body=${body}`,
    '_blank'
  );
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
            <button class="video-btn" onclick="startVideoCall()">🎥 Video</button>
          </div>
        `;
      }
      return `
        <div class="slot ${slot.is_booked ? 'booked' : ''}">
          <span>${slot.date} at ${slot.time}</span>
          <span>${slot.is_booked ? `Booked by ${slot.patient_name}` : 'Available'}</span>
          ${actions}
        </div>
      `;
    }).join('');
    container.innerHTML = slots.map(slot => {
  let actions = '';
  if (slot.is_booked && slot.patient_name) {
    const phone = slot.patient_phone || '';
    actions = `
      <div>
        <a href="tel:${phone}" class="call-btn">📞 Call</a>
        <button class="video-btn" onclick="startVideoCall()">🎥 Video</button>
        <button class="danger-btn" onclick="cancelAppointmentByDoctor(${slot.id})">❌ Cancel</button>
      </div>
    `;
  } else if (!slot.is_booked) {
    actions = `
      <div>
        <button class="danger-btn" onclick="deleteSlot(${slot.id})">🗑️ Delete</button>
      </div>
    `;
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
  } catch (err) {
    showMessage(err.message, 'error');
  }
}

async function cancelAppointmentByDoctor(appointmentId) {
  if (!confirm('Cancel this booked appointment?')) return;
  try {
    await api(`/api/doctor/appointments/${appointmentId}`, 'DELETE');
    showMessage('Appointment cancelled');
    loadDoctorSchedule();
  } catch (err) {
    showMessage(err.message, 'error');
  }
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
  } catch (err) {
    showMessage(err.message, 'error');
  }
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
        </div>
      </div>
    `).join('');
    container.innerHTML = appointments.map(appt => `
  <div class="slot booked">
    <span>${appt.date} at ${appt.time} with Dr. ${appt.doctor_name}</span>
    <span>Contact: ${appt.doctor_email} / ${appt.doctor_phone || 'N/A'}</span>
    <div>
      <a href="tel:${appt.doctor_phone}" class="call-btn">📞 Call</a>
      <button class="video-btn" onclick="startVideoCall()">🎥 Video</button>
      <button class="danger-btn" onclick="cancelAppointment(${appt.id})">❌ Cancel</button>
    </div>
  </div>
`).join('');
  } catch (err) {
    showMessage(err.message, 'error');
  }
}
async function cancelAppointment(appointmentId) {
  if (!confirm('Are you sure you want to cancel this appointment?')) return;
  try {
    await api(`/api/appointments/${appointmentId}`, 'DELETE');
    showMessage('Appointment cancelled');
    loadMyAppointments();
    loadDoctors(); // refresh available slots
  } catch (err) {
    showMessage(err.message, 'error');
  }
}

// ---------- Logout ----------
async function logout() {
  await api('/api/logout', 'POST');
  currentUser = null;
  renderAuth();
}

// ---------- Start ----------
init();