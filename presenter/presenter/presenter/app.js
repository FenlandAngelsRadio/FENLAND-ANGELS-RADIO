const DATA_URL = 'presenter-data.json';

function updateClock() {
  const now = new Date();

  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(now);

  const date = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(now);

  document.getElementById('clock').textContent = time;
  document.getElementById('date').textContent = date;
}

function updateCountdown(iso) {
  const countdown = document.getElementById('countdown');

  if (!iso) {
    countdown.textContent = '--:--';
    return;
  }

  const target = new Date(iso);
  const now = new Date();
  const difference = target - now;

  if (difference <= 0) {
    countdown.textContent = '00:00';
    return;
  }

  const totalSeconds = Math.floor(difference / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    countdown.textContent =
      `${String(hours).padStart(2, '0')}:` +
      `${String(minutes).padStart(2, '0')}:` +
      `${String(seconds).padStart(2, '0')}`;
  } else {
    countdown.textContent =
      `${String(minutes).padStart(2, '0')}:` +
      `${String(seconds).padStart(2, '0')}`;
  }
}

let nextFixedIso = null;

function renderUpcoming(items) {
  const container = document.getElementById('upcoming');
  container.innerHTML = '';

  if (!Array.isArray(items) || items.length === 0) {
    container.innerHTML =
      '<p class="subtext">No upcoming schedule information.</p>';
    return;
  }

  items.forEach(item => {
    const row = document.createElement('div');
    row.className = 'upcoming-row';

    const time = document.createElement('div');
    time.className = 'upcoming-time';
    time.textContent = item.time || '--:--';

    const title = document.createElement('div');
    title.textContent = item.title || 'Scheduled item';

    const type = document.createElement('div');
    type.className = 'upcoming-type';
    type.textContent = item.type || '';

    row.appendChild(time);
    row.appendChild(title);
    row.appendChild(type);

    container.appendChild(row);
  });
}

async function loadPresenterData() {
  try {
    const response = await fetch(
      `${DATA_URL}?t=${Date.now()}`,
      { cache: 'no-store' }
    );

    if (!response.ok) {
      throw new Error('Data unavailable');
    }

    const data = await response.json();

    document.getElementById('dataStatus').textContent =
      data.status || 'Connected';

    document.getElementById('statusDot').classList.add('live');

    document.getElementById('nowTitle').textContent =
      data.now?.title || 'Fenland Angels Radio';

    document.getElementById('nowArtist').textContent =
      data.now?.artist || '';

    document.getElementById('nextTitle').textContent =
      data.next?.title || 'Waiting';

    document.getElementById('nextArtist').textContent =
      data.next?.artist || '';

    document.getElementById('fixedName').textContent =
      data.nextFixedEvent?.name || 'No fixed event';

    document.getElementById('fixedTime').textContent =
      data.nextFixedEvent?.time || '--:--';

    nextFixedIso = data.nextFixedEvent?.iso || null;

    renderUpcoming(data.upcoming);

  } catch (error) {
    document.getElementById('dataStatus').textContent =
      'Data unavailable';

    document.getElementById('statusDot').classList.remove('live');
  }
}

updateClock();
setInterval(updateClock, 1000);

loadPresenterData();
setInterval(loadPresenterData, 5000);

setInterval(() => {
  updateCountdown(nextFixedIso);
}, 1000);
