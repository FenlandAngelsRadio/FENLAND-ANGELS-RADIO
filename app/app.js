const radio = document.getElementById('radio');
const play = document.getElementById('play');
const state = document.getElementById('state');
const volume = document.getElementById('volume');

radio.volume = 0.8;

let shouldBePlaying = false;
let reconnectTimer = null;
let reconnectAttempts = 0;

const RECONNECT_DELAY = 3000;
const MAX_RECONNECT_DELAY = 15000;

function clearReconnectTimer() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function scheduleReconnect() {
  if (!shouldBePlaying || reconnectTimer) return;

  const delay = Math.min(
    RECONNECT_DELAY + (reconnectAttempts * 2000),
    MAX_RECONNECT_DELAY
  );

  state.textContent = 'Reconnecting…';

  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;

    if (!shouldBePlaying) return;

    reconnectAttempts++;

    try {
      /*
       * Reload the live stream so the browser creates a fresh
       * connection instead of trying to continue a dead one.
       */
      radio.load();

      await radio.play();
    } catch (e) {
      scheduleReconnect();
    }
  }, delay);
}

play.addEventListener('click', async () => {
  if (!shouldBePlaying) {
    shouldBePlaying = true;
    reconnectAttempts = 0;
    clearReconnectTimer();

    state.textContent = 'Connecting…';

    try {
      await radio.play();
    } catch (e) {
      scheduleReconnect();
    }
  } else {
    shouldBePlaying = false;
    reconnectAttempts = 0;
    clearReconnectTimer();

    radio.pause();

    play.textContent = '▶';
    state.textContent = 'Paused';
  }
});

radio.addEventListener('playing', () => {
  clearReconnectTimer();
  reconnectAttempts = 0;

  play.textContent = '❚❚';
  state.textContent = 'Playing live';
});

radio.addEventListener('pause', () => {
  play.textContent = '▶';

  if (shouldBePlaying) {
    scheduleReconnect();
  } else {
    state.textContent = 'Paused';
  }
});

radio.addEventListener('waiting', () => {
  if (shouldBePlaying) {
    state.textContent = 'Reconnecting…';
  }
});

radio.addEventListener('stalled', () => {
  if (shouldBePlaying) {
    scheduleReconnect();
  }
});

radio.addEventListener('error', () => {
  if (shouldBePlaying) {
    scheduleReconnect();
  } else {
    state.textContent = 'Stream unavailable';
  }
});

radio.addEventListener('ended', () => {
  if (shouldBePlaying) {
    scheduleReconnect();
  }
});

radio.addEventListener('abort', () => {
  if (shouldBePlaying) {
    scheduleReconnect();
  }
});

volume.addEventListener('input', () => {
  radio.volume = Number(volume.value);
});


/* -----------------------------
   SERVICE WORKER
------------------------------ */

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () =>
    navigator.serviceWorker
      .register('./service-worker.js?v=3')
      .catch(() => {})
  );
}


/* -----------------------------
   INSTALL APP
------------------------------ */

let deferredPrompt = null;

const installButton = document.getElementById('installApp');
const installHint = document.getElementById('installHint');

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredPrompt = event;

  if (installButton) {
    installButton.style.display = 'inline-block';
  }

  if (installHint) {
    installHint.textContent =
      'Fenland Angels Radio is ready to install.';
  }
});

if (installButton) {
  installButton.addEventListener('click', async () => {

    if (deferredPrompt) {
      deferredPrompt.prompt();

      const result = await deferredPrompt.userChoice;

      if (result.outcome === 'accepted' && installHint) {
        installHint.textContent =
          'Fenland Angels Radio installed.';
      }

      deferredPrompt = null;
      return;
    }

    const isIOS =
      /iphone|ipad|ipod/i.test(navigator.userAgent);

    if (installHint) {
      if (isIOS) {
        installHint.textContent =
          'On iPhone or iPad: tap Share, then choose Add to Home Screen.';
      } else {
        installHint.textContent =
          'If installation does not appear, open this page in Chrome or Edge and choose Install App from the browser menu.';
      }
    }
  });
}

window.addEventListener('appinstalled', () => {
  if (installHint) {
    installHint.textContent =
      'Fenland Angels Radio is installed.';
  }

  if (installButton) {
    installButton.textContent = '✓ App Installed';
  }
});


/* -----------------------------
   HIDE INSTALL CONTROLS
   WHEN RUNNING AS APP
------------------------------ */

const runningAsApp =
  window.matchMedia('(display-mode: standalone)').matches ||
  window.navigator.standalone === true;

if (runningAsApp) {
  if (installButton) installButton.style.display = 'none';
  if (installHint) installHint.style.display = 'none';
}
