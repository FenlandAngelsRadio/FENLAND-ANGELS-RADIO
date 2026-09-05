document.addEventListener('DOMContentLoaded', () => {
  const audio = document.getElementById('radioStream');
  const mainPlay = document.getElementById('mainPlay');
  const status = document.getElementById('playerStatus');
  const volume = document.getElementById('volume');
  const playButtons = document.querySelectorAll('[data-action="play"]');

  function setState(playing) {
    if (mainPlay) mainPlay.textContent = playing ? '❚❚' : '▶';
    if (status) status.textContent = playing ? 'LIVE — Fenland Angels Radio' : 'Tap play to listen live';
    playButtons.forEach(btn => {
      btn.textContent = playing
        ? (btn.classList.contains('footer-play') ? 'Pause Fenland Angels Radio' : '❚❚ Pause Live')
        : (btn.classList.contains('footer-play') ? 'Play Fenland Angels Radio' : (btn.id === 'topListen' ? '🎧 Listen Live' : '▶ Listen Live'));
    });
  }

  async function toggleRadio() {
    if (!audio) return;
    try {
      if (audio.paused) {
        status.textContent = 'Connecting to live stream…';
        await audio.play();
      } else {
        audio.pause();
      }
    } catch (err) {
      status.textContent = 'Unable to start stream — tap again in a moment';
      setState(false);
    }
  }

  if (mainPlay) mainPlay.addEventListener('click', toggleRadio);
  playButtons.forEach(btn => btn.addEventListener('click', toggleRadio));

  if (volume && audio) {
    audio.volume = Number(volume.value);
    volume.addEventListener('input', () => {
      audio.volume = Number(volume.value);
    });
  }

  if (audio) {
    audio.addEventListener('playing', () => setState(true));
    audio.addEventListener('pause', () => setState(false));
    audio.addEventListener('waiting', () => {
      if (status) status.textContent = 'Connecting to live stream…';
    });
    audio.addEventListener('error', () => {
      if (status) status.textContent = 'Stream unavailable right now';
      setState(false);
    });
  }

  document.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener('click', event => {
      const target = document.querySelector(link.getAttribute('href'));
      if (target) {
        event.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });
});
