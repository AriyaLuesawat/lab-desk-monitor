const DESKS = Array.from({ length: 12 }, (_, i) => `D-${String(i + 1).padStart(2, '0')}`);
const STORE_KEY = 'lab-desk-monitor-v1';
const $ = (selector) => document.querySelector(selector);

function readState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
    return {
      occupancy: Array.isArray(saved.occupancy) && saved.occupancy.length === 12 ? saved.occupancy : randomOccupancy(),
      reservations: Array.isArray(saved.reservations) ? saved.reservations : [],
    };
  } catch {
    return { occupancy: randomOccupancy(), reservations: [] };
  }
}

function randomOccupancy() {
  return DESKS.map(() => Math.random() < 0.38 ? 'occupied' : 'available');
}

let state = readState();
let chosenDesk = null;

function saveState() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch { /* Private browsing may disable storage. */ }
}

function activeReservations() {
  const now = Date.now();
  const current = state.reservations.filter((booking) => Number(booking.endsAt) > now);
  if (current.length !== state.reservations.length) {
    state.reservations = current;
    saveState();
  }
  return current;
}

function deskState(deskId) {
  if (activeReservations().some((booking) => booking.deskId === deskId)) return 'reserved';
  return state.occupancy[DESKS.indexOf(deskId)] === 'occupied' ? 'occupied' : 'available';
}

function formatTime(timestamp) {
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(timestamp));
}

function renderDashboard() {
  const counts = { available: 0, occupied: 0, reserved: 0 };
  const grid = $('#desk-grid');
  grid.replaceChildren();
  DESKS.forEach((id) => {
    const status = deskState(id);
    counts[status]++;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `desk-card ${status}`;
    button.setAttribute('aria-label', `${id}, ${status === 'occupied' ? 'in use' : status}. ${status === 'available' ? 'Select to reserve.' : ''}`);
    button.innerHTML = `<span class="desk-top"><span class="desk-id">${id}</span><span class="desk-state">${status === 'occupied' ? 'In use' : status === 'reserved' ? 'Reserved' : 'Available'}</span></span><span class="desk-visual" aria-hidden="true"></span>`;
    button.addEventListener('click', () => {
      if (status === 'available') openReservation(id);
      else if (status === 'reserved') showView('bookings');
    });
    grid.append(button);
  });
  $('#available-count').textContent = counts.available;
  $('#occupied-count').textContent = counts.occupied;
  $('#reserved-count').textContent = counts.reserved;
}

function renderBookings() {
  const list = $('#booking-list');
  const bookings = activeReservations().sort((a, b) => a.endsAt - b.endsAt);
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
    const title = document.createElement('strong');
    title.textContent = `Desk ${booking.deskId}`;
    const info = document.createElement('p');
    info.textContent = `Student ID ${booking.studentId} · Until ${formatTime(booking.endsAt)}`;
    details.append(title, info);
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = 'Cancel booking';
    cancel.addEventListener('click', () => {
      state.reservations = state.reservations.filter((item) => item.id !== booking.id);
      saveState();
      renderAll();
    });
    row.append(details, cancel);
    list.append(row);
  });
}

function renderAll() {
  renderDashboard();
  renderBookings();
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

function closeReservation() {
  $('#reserve-dialog').close();
  chosenDesk = null;
}

document.querySelectorAll('.nav-link').forEach((link) => link.addEventListener('click', () => showView(link.dataset.view)));
$('#randomize-button').addEventListener('click', () => { state.occupancy = randomOccupancy(); saveState(); renderAll(); });
$('#close-dialog').addEventListener('click', closeReservation);
$('#cancel-dialog').addEventListener('click', closeReservation);
$('#reserve-dialog').addEventListener('click', (event) => { if (event.target === $('#reserve-dialog')) closeReservation(); });
$('#reserve-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const studentId = $('#student-id').value.trim();
  if (!studentId) { $('#form-error').textContent = 'Please enter your student ID.'; return; }
  if (!chosenDesk || deskState(chosenDesk) !== 'available') { $('#form-error').textContent = 'This desk is no longer available.'; return; }
  const duration = Number($('#duration').value);
  state.reservations.push({ id: crypto.randomUUID(), deskId: chosenDesk, studentId, endsAt: Date.now() + duration * 60_000 });
  saveState();
  closeReservation();
  renderAll();
  showView('bookings');
});

$('#today-label').textContent = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date());
saveState();
renderAll();
const initialView = location.hash.slice(1);
if (['dashboard', 'photo', 'bookings'].includes(initialView)) showView(initialView);
setInterval(renderAll, 60_000);

// Photo analysis is independent of simulated room availability. The user must
// mark desk and chair zones because a generic object detector cannot locate
// individual workstations reliably in arbitrary laboratory images.
const canvas = $('#photo-canvas');
const ctx = canvas.getContext('2d');
let photo = null;
let zones = [];
let dragStart = null;
let dragCurrent = null;
let predictions = [];
let model = null;
let loadingModel = null;

function photoStatus(message) { $('#analysis-status').textContent = message; }

function setCanvasSize(img) {
  const scale = Math.min(1, 1600 / img.naturalWidth);
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
}

function zoneBox(zone) {
  return [zone.x * canvas.width, zone.y * canvas.height, zone.w * canvas.width, zone.h * canvas.height];
}

function personInZone(zone) {
  const [zx, zy, zw, zh] = zoneBox(zone);
  return predictions.some((item) => {
    if (item.class !== 'person' || item.score < .5) return false;
    const [x, y, w, h] = item.bbox;
    const px = Math.max(0, Math.min(x + w, zx + zw) - Math.max(x, zx));
    const py = Math.max(0, Math.min(y + h, zy + zh) - Math.max(y, zy));
    return px * py > Math.min(w * h, zw * zh) * .12;
  });
}

function drawPhoto() {
  if (!photo) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(photo, 0, 0, canvas.width, canvas.height);
  zones.forEach((zone, index) => {
    const [x, y, w, h] = zoneBox(zone);
    const status = zone.status;
    const color = status === 'occupied' ? '#f4ad4f' : status === 'available' ? '#a5e75b' : '#65abef';
    ctx.fillStyle = `${color}33`;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(3, canvas.width / 400);
    ctx.strokeRect(x, y, w, h);
    ctx.font = `700 ${Math.max(13, canvas.width / 65)}px Arial`;
    ctx.fillStyle = color;
    ctx.fillText(`DESK ${index + 1}`, x + 7, Math.max(19, y + 22));
  });
  if (dragStart && dragCurrent) {
    const x = Math.min(dragStart.x, dragCurrent.x);
    const y = Math.min(dragStart.y, dragCurrent.y);
    const w = Math.abs(dragCurrent.x - dragStart.x);
    const h = Math.abs(dragCurrent.y - dragStart.y);
    ctx.fillStyle = '#88cfff44'; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#67c3ff'; ctx.lineWidth = 3; ctx.strokeRect(x, y, w, h);
  }
}

function renderZones() {
  $('#zone-count').textContent = `${zones.length} zone${zones.length === 1 ? '' : 's'}`;
  $('#clear-zones-button').disabled = zones.length === 0;
  $('#analyze-button').disabled = !photo || zones.length === 0;
  const list = $('#zone-list');
  list.replaceChildren();
  if (!zones.length) { list.innerHTML = '<div class="empty-zones">Your marked desk zones will appear here.</div>'; return; }
  zones.forEach((zone, index) => {
    const row = document.createElement('div');
    row.className = `zone-row ${zone.status}`;
    const info = document.createElement('div');
    const title = document.createElement('strong'); title.textContent = `Desk ${index + 1}`;
    const note = document.createElement('small');
    note.textContent = zone.status === 'occupied' ? 'Person detected' : zone.status === 'available' ? 'No person detected · verify' : 'Not analyzed yet';
    info.append(title, note);
    const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '×'; remove.setAttribute('aria-label', `Remove desk ${index + 1}`);
    remove.addEventListener('click', () => { zones.splice(index, 1); renderZones(); drawPhoto(); });
    row.append(info, remove); list.append(row);
  });
}

function canvasPoint(event) {
  const bounds = canvas.getBoundingClientRect();
  return { x: Math.max(0, Math.min(canvas.width, (event.clientX - bounds.left) * canvas.width / bounds.width)), y: Math.max(0, Math.min(canvas.height, (event.clientY - bounds.top) * canvas.height / bounds.height)) };
}

canvas.addEventListener('pointerdown', (event) => {
  if (!photo || zones.length >= 24) return;
  canvas.setPointerCapture(event.pointerId);
  dragStart = canvasPoint(event);
  dragCurrent = dragStart;
});
canvas.addEventListener('pointermove', (event) => { if (!dragStart) return; dragCurrent = canvasPoint(event); drawPhoto(); });
canvas.addEventListener('pointerup', (event) => {
  if (!dragStart) return;
  const end = canvasPoint(event);
  const x = Math.min(dragStart.x, end.x), y = Math.min(dragStart.y, end.y);
  const w = Math.abs(end.x - dragStart.x), h = Math.abs(end.y - dragStart.y);
  dragStart = null; dragCurrent = null;
  if (w > canvas.width * .025 && h > canvas.height * .025) {
    zones.push({ x: x / canvas.width, y: y / canvas.height, w: w / canvas.width, h: h / canvas.height, status: 'unknown' });
    photoStatus(`${zones.length} desk zone${zones.length === 1 ? '' : 's'} marked. Select Analyze desks when ready.`);
  }
  renderZones(); drawPhoto();
});
canvas.addEventListener('pointercancel', () => { dragStart = null; dragCurrent = null; drawPhoto(); });

$('#photo-input').addEventListener('change', (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) { photoStatus('Please choose an image file.'); return; }
  const objectUrl = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => {
    photo = image;
    setCanvasSize(image);
    zones = []; predictions = [];
    $('#empty-photo').hidden = true; canvas.hidden = false;
    renderZones(); drawPhoto();
    photoStatus('Photo loaded. Drag over each desk and chair area to mark zones.');
    URL.revokeObjectURL(objectUrl);
  };
  image.onerror = () => { photoStatus('This image could not be opened.'); URL.revokeObjectURL(objectUrl); };
  image.src = objectUrl;
});

$('#clear-zones-button').addEventListener('click', () => { zones = []; predictions = []; renderZones(); drawPhoto(); photoStatus('Zones cleared. Drag over the photo to mark desks again.'); });

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script'); script.src = src; script.onload = resolve; script.onerror = () => reject(new Error('The detection library could not load. Check your internet connection.'));
    document.head.append(script);
  });
}

async function ensureModel() {
  if (model) return model;
  if (!loadingModel) loadingModel = (async () => {
    if (!window.tf) await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js');
    if (!window.cocoSsd) await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd@2.2.2/dist/coco-ssd.min.js');
    model = await window.cocoSsd.load();
    return model;
  })().catch((error) => { loadingModel = null; throw error; });
  return loadingModel;
}

$('#analyze-button').addEventListener('click', async () => {
  if (!photo || !zones.length) return;
  const button = $('#analyze-button'); button.disabled = true;
  photoStatus('Loading the object detector and analyzing the photo…');
  try {
    const detector = await ensureModel();
    const cleanFrame = document.createElement('canvas');
    cleanFrame.width = canvas.width;
    cleanFrame.height = canvas.height;
    cleanFrame.getContext('2d').drawImage(photo, 0, 0, canvas.width, canvas.height);
    predictions = await detector.detect(cleanFrame, 50, .5);
    zones.forEach((zone) => { zone.status = personInZone(zone) ? 'occupied' : 'available'; });
    const available = zones.filter((zone) => zone.status === 'available').length;
    photoStatus(`${available} of ${zones.length} marked desks have no detected person. Please verify the image before reserving a real desk.`);
    renderZones(); drawPhoto();
  } catch (error) { photoStatus(error?.message || 'Photo analysis failed. Please try again.'); }
  finally { button.disabled = !photo || !zones.length; }
});
