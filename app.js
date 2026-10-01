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
        // A live station must reconnect rather than resume audio held during a pause.
        audio.load();
        status.textContent = 'Connecting to live stream…';
        await audio.play();
      } else {
        audio.pause();
      }
    } catch (err) {
      setState(false);
      status.textContent = 'Unable to start stream — tap Play to try again';
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
    audio.addEventListener('playing', () => {
      setState(true);
      if (window.FARAnalytics) window.FARAnalytics.startListening('website');
    });
    audio.addEventListener('pause', () => {
      setState(false);
      if (window.FARAnalytics) window.FARAnalytics.stopListening('website');
    });
    audio.addEventListener('waiting', () => {
      if (status) status.textContent = 'Connecting to live stream…';
    });
    audio.addEventListener('ended', () => {
      if (window.FARAnalytics) window.FARAnalytics.stopListening('website');
      setState(false);
      if (status) status.textContent = 'Stream disconnected — tap Play to reconnect';
    });
    audio.addEventListener('error', () => {
      if (window.FARAnalytics) window.FARAnalytics.stopListening('website');
      setState(false);
      if (status) status.textContent = 'Stream unavailable — tap Play to reconnect';
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
