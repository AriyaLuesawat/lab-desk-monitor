const DESKS = Array.from({ length: 12 }, (_, i) => `D-${String(i + 1).padStart(2, '0')}`);
const STORE_KEY = 'lab-desk-monitor-shared-v1';
const $ = (selector) => document.querySelector(selector);

function readBookings() {
  try {
    const value = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
    return Array.isArray(value) ? value.filter((item) => item && typeof item.deskId === 'string' && typeof item.token === 'string') : [];
  } catch { return []; }
}

let myBookings = readBookings();
let remoteDesks = new Map();
let hasSnapshot = false;
let chosenDesk = null;
let syncPromise = null;

function saveBookings() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(myBookings)); } catch { /* Browser storage may be disabled. */ }
}

function setOverviewStatus(message, error = false) {
  const output = $('#overview-status');
  output.textContent = message;
  output.classList.toggle('error', error);
}

function formatTime(timestamp) {
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(timestamp));
}

function deskState(deskId) {
  return remoteDesks.get(deskId)?.status || 'unknown';
}

function activeBookings() {
  const now = Date.now();
  const current = myBookings.filter((booking) => {
    const shared = remoteDesks.get(booking.deskId);
    return Number(booking.reservedUntil) > now && (!hasSnapshot || (shared?.status === 'reserved' && shared.reservedUntil === booking.reservedUntil));
  });
  if (current.length !== myBookings.length) {
    myBookings = current;
    saveBookings();
  }
  return current;
}

function renderDashboard() {
  const counts = { available: 0, occupied: 0, reserved: 0 };
  const grid = $('#desk-grid');
  grid.replaceChildren();
  DESKS.forEach((id) => {
    const status = deskState(id);
    if (status in counts) counts[status]++;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `desk-card ${status}`;
    button.disabled = !hasSnapshot || status !== 'available' && !(status === 'reserved' && activeBookings().some((item) => item.deskId === id));
    const label = status === 'occupied' ? 'In use' : status === 'reserved' ? 'Reserved' : status === 'available' ? 'Available' : 'Loading';
    button.setAttribute('aria-label', `${id}, ${label}. ${status === 'available' ? 'Select to reserve.' : ''}`);
    button.innerHTML = `<span class="desk-top"><span class="desk-id">${id}</span><span class="desk-state">${label}</span></span><span class="desk-visual" aria-hidden="true"></span>`;
    button.addEventListener('click', () => {
      if (status === 'available') openReservation(id);
      else if (status === 'reserved') showView('bookings');
    });
    grid.append(button);
  });
  $('#available-count').textContent = hasSnapshot ? counts.available : '—';
  $('#occupied-count').textContent = hasSnapshot ? counts.occupied : '—';
  $('#reserved-count').textContent = hasSnapshot ? counts.reserved : '—';
  $('#randomize-button').disabled = !hasSnapshot;
}

function renderBookings() {
  const list = $('#booking-list');
  const bookings = activeBookings().sort((a, b) => a.reservedUntil - b.reservedUntil);
  $('#booking-count').textContent = `${bookings.length} reservation${bookings.length === 1 ? '' : 's'}`;
  list.replaceChildren();
  if (!bookings.length) {
    list.innerHTML = '<div class="empty-bookings"><strong>No reservations yet</strong>Select an available desk in the overview to make a test booking.</div>';
    return;
  }
  bookings.forEach((booking) => {
    const row = document.createElement('div');
    row.className = 'booking-row';
    const details = document.createElement('div');
    const title = document.createElement('strong'); title.textContent = `Desk ${booking.deskId}`;
    const info = document.createElement('p');
    info.textContent = `Student ID ${booking.studentId} · Until ${formatTime(booking.reservedUntil)}`;
    details.append(title, info);
    const cancel = document.createElement('button');
    cancel.type = 'button'; cancel.textContent = 'Cancel booking';
    cancel.addEventListener('click', async () => {
      cancel.disabled = true;
      try {
        const response = await fetch('/api/reservations', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deskId: booking.deskId, token: booking.token }) });
        if (!response.ok && response.status !== 404) throw new Error((await response.json()).error || 'Could not cancel booking.');
        myBookings = myBookings.filter((item) => item.token !== booking.token);
        saveBookings();
        $('#booking-status').textContent = 'Reservation cancelled.';
        $('#booking-status').classList.remove('error');
        await syncDesks();
      } catch (error) {
        $('#booking-status').textContent = error.message || 'Could not cancel booking.';
        $('#booking-status').classList.add('error');
        cancel.disabled = false;
      }
    });
    row.append(details, cancel);
    list.append(row);
  });
}

function renderAll() { renderDashboard(); renderBookings(); }

async function syncDesks() {
  if (syncPromise) return syncPromise;
  syncPromise = (async () => {
    try {
      const response = await fetch('/api/desks', { cache: 'no-store' });
      if (!response.ok) throw new Error('Shared desk status is unavailable. Try again soon.');
      const data = await response.json();
      if (!Array.isArray(data.desks) || data.desks.length !== DESKS.length) throw new Error('Desk data is incomplete.');
      remoteDesks = new Map(data.desks.map((desk) => [desk.id, desk]));
      hasSnapshot = true;
      setOverviewStatus(`Shared test data · Updated ${formatTime(Date.now())}`);
    } catch (error) {
      hasSnapshot = false;
      setOverviewStatus(error.message || 'Shared desk status is unavailable.', true);
    } finally { renderAll(); syncPromise = null; }
  })();
  return syncPromise;
}

function showView(name) {
  document.querySelectorAll('.view').forEach((view) => view.classList.toggle('active', view.id === `${name}-view`));
  document.querySelectorAll('.nav-link').forEach((link) => link.classList.toggle('active', link.dataset.view === name));
  $('#page-label').textContent = { dashboard: 'OVERVIEW', photo: 'PHOTO ANALYSIS', bookings: 'RESERVATIONS' }[name];
  window.location.hash = name;
  window.scrollTo(0, 0);
}

function openReservation(id) {
  chosenDesk = id;
  $('#dialog-title').textContent = `Reserve ${id}`;
  $('#student-id').value = '';
  $('#form-error').textContent = '';
  $('#reserve-dialog').showModal();
  $('#student-id').focus();
}

function closeReservation() { $('#reserve-dialog').close(); chosenDesk = null; }

document.querySelectorAll('.nav-link').forEach((link) => link.addEventListener('click', () => showView(link.dataset.view)));
$('#randomize-button').addEventListener('click', async () => {
  const button = $('#randomize-button'); button.disabled = true;
  try {
    const response = await fetch('/api/desks/shuffle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    if (!response.ok) throw new Error((await response.json()).error || 'Could not shuffle desks.');
    await syncDesks();
  } catch (error) { setOverviewStatus(error.message || 'Could not shuffle desks.', true); }
  finally { button.disabled = !hasSnapshot; }
});
$('#close-dialog').addEventListener('click', closeReservation);
$('#cancel-dialog').addEventListener('click', closeReservation);
$('#reserve-dialog').addEventListener('click', (event) => { if (event.target === $('#reserve-dialog')) closeReservation(); });
$('#reserve-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const studentId = $('#student-id').value.trim();
  if (!/^[A-Za-z0-9-]{1,30}$/.test(studentId)) { $('#form-error').textContent = 'Use letters, numbers, or hyphens for the student ID.'; return; }
  if (!chosenDesk || deskState(chosenDesk) !== 'available') { $('#form-error').textContent = 'This desk is no longer available.'; return; }
  const submit = $('#reserve-form button[type="submit"]'); submit.disabled = true;
  try {
    const response = await fetch('/api/reservations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deskId: chosenDesk, studentId, duration: Number($('#duration').value) }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not reserve this desk.');
    myBookings.push(data);
    saveBookings();
    closeReservation();
    await syncDesks();
    showView('bookings');
  } catch (error) {
    $('#form-error').textContent = error.message || 'Could not reserve this desk.';
    await syncDesks();
  } finally { submit.disabled = false; }
});

$('#today-label').textContent = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date());
renderAll();
const initialView = location.hash.slice(1);
if (['dashboard', 'photo', 'bookings'].includes(initialView)) showView(initialView);
syncDesks();
setInterval(syncDesks, 15_000);
window.addEventListener('focus', syncDesks);
