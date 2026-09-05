const DATA_URL = 'presenter-data.json';
const REFRESH_MS = 5000;
let latestData = null;

function updateClock() {
  const now = new Date();
  document.getElementById('clock').textContent = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    timeZone: 'Europe/London'
  }).format(now);

  document.getElementById('date').textContent = new Intl.DateTimeFormat('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    timeZone: 'Europe/London'
  }).format(now);

  updateCountdown(now);
}

function setStatus(ok, text) {
  const dot = document.getElementById('statusDot');
  const label = document.getElementById('statusText');
  dot.classList.toggle('live', ok);
  label.textContent = text;
}

function textOrDash(value) {
  return value && String(value).trim() ? value : '—';
}

function render(data) {
  latestData = data;
  document.getElementById('nowTitle').textContent = textOrDash(data.now?.title);
  document.getElementById('nowArtist').textContent = textOrDash(data.now?.artist);
  document.getElementById('nextTitle').textContent = textOrDash(data.next?.title);
  document.getElementById('nextArtist').textContent = textOrDash(data.next?.artist);
  document.getElementById('nextBreak').textContent = textOrDash(data.nextFixedEvent?.name);
  document.getElementById('nextBreakTime').textContent = textOrDash(data.nextFixedEvent?.time);
  document.getElementById('sourceName').textContent = textOrDash(data.source || DATA_URL);

  const upcoming = document.getElementById('upcoming');
  upcoming.innerHTML = '';
  (data.upcoming || []).slice(0, 8).forEach(item => {
    const row = document.createElement('div');
    row.className = 'upcoming-row';
    row.innerHTML = `
      <div class="upcoming-time">${escapeHtml(item.time || '—')}</div>
      <div>${escapeHtml(item.title || '—')}</div>
      <div class="upcoming-type">${escapeHtml(item.type || '')}</div>
    `;
    upcoming.appendChild(row);
  });

  if (!upcoming.children.length) {
    upcoming.innerHTML = '<div class="upcoming-row"><div class="upcoming-time">—</div><div>No upcoming items supplied</div><div class="upcoming-type"></div></div>';
  }

  setStatus(true, data.status || 'Live data connected');
}

function updateCountdown(now = new Date()) {
  const el = document.getElementById('countdown');
  const time = latestData?.nextFixedEvent?.iso;
  if (!time) {
    el.textContent = '--:--';
    return;
  }

  const target = new Date(time);
  const diff = Math.max(0, target.getTime() - now.getTime());
  const totalSeconds = Math.floor(diff / 1000);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  el.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

async function loadData() {
  try {
    const response = await fetch(`${DATA_URL}?t=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    render(data);
  } catch (err) {
    setStatus(false, 'Using sample/offline data');
    console.warn('Presenter data unavailable:', err);
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

updateClock();
loadData();
setInterval(updateClock, 1000);
setInterval(loadData, REFRESH_MS);
