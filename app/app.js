const radio = document.getElementById('radio');
const play = document.getElementById('play');
const state = document.getElementById('state');
const volume = document.getElementById('volume');

radio.volume = 0.8;

/*
 * True only when the listener has asked the radio to play.
 * Lock-screen/media controls update this value too.
 */
let wantsPlayback = false;
let recovering = false;


/* =========================================================
   PLAYER
========================================================= */

async function startRadio() {
  wantsPlayback = true;

  play.textContent = '❚❚';
  state.textContent = 'Connecting…';

  updateMediaPlaybackState('playing');

  try {
    await radio.play();
  } catch (error) {
    state.textContent = 'Could not connect';
    updateMediaPlaybackState('paused');
  }
}


function stopRadio() {
  /*
   * This is an intentional pause.
   * Do NOT automatically restart after this.
   */
  wantsPlayback = false;
  recovering = false;

  radio.pause();

  play.textContent = '▶';
  state.textContent = 'Paused';

  updateMediaPlaybackState('paused');
}


async function recoverRadio() {
  /*
   * Only recover if the listener still wants FAR playing.
   */
  if (!wantsPlayback || recovering) return;

  recovering = true;
  state.textContent = 'Reconnecting…';

  try {
    /*
     * Create a fresh connection to the live stream.
     */
    radio.load();

    await radio.play();

    recovering = false;

  } catch (error) {
    /*
     * Do not create an endless background timer here.
     * Android can suspend JavaScript timers while locked.
     *
     * Recovery will be attempted again when the browser/app
     * becomes active, the network returns, or the listener
     * presses Play.
     */
    recovering = false;

    if (wantsPlayback) {
      state.textContent = 'Waiting for stream…';
    }
  }
}


/* =========================================================
   MAIN PLAY BUTTON
========================================================= */

play.addEventListener('click', async () => {

  if (wantsPlayback) {
    stopRadio();
  } else {
    await startRadio();
  }

});


/* =========================================================
   AUDIO EVENTS
========================================================= */

radio.addEventListener('playing', () => {

  recovering = false;

  play.textContent = '❚❚';
  state.textContent = 'Playing live';

  updateMediaPlaybackState('playing');
});


radio.addEventListener('pause', () => {

  play.textContent = '▶';

  /*
   * IMPORTANT:
   *
   * Do not automatically restart simply because a pause
   * event occurred.
   *
   * Android/browser media controls can generate pause events.
   */
  if (!wantsPlayback) {
    state.textContent = 'Paused';
    updateMediaPlaybackState('paused');
  }
});


radio.addEventListener('waiting', () => {

  if (wantsPlayback) {
    state.textContent = 'Buffering…';
  }

});


radio.addEventListener('stalled', () => {

  if (wantsPlayback) {
    state.textContent = 'Connection interrupted';
  }

});


radio.addEventListener('error', () => {

  if (wantsPlayback) {
    recoverRadio();
  } else {
    state.textContent = 'Stream unavailable';
  }

});


radio.addEventListener('ended', () => {

  if (wantsPlayback) {
    recoverRadio();
  }

});


/* =========================================================
   NETWORK RECOVERY
========================================================= */

/*
 * If the phone loses Wi-Fi/mobile data and then reconnects,
 * immediately try the radio again if the listener had it on.
 */

window.addEventListener('online', () => {

  if (wantsPlayback && radio.paused) {
    recoverRadio();
  }

});


window.addEventListener('offline', () => {

  if (wantsPlayback) {
    state.textContent = 'Waiting for connection…';
  }

});


/* =========================================================
   APP / SCREEN RECOVERY
========================================================= */

/*
 * If Android suspended the PWA while the screen was locked,
 * check playback when the app becomes active again.
 *
 * This does NOT restart the radio if the listener intentionally
 * paused it.
 */

document.addEventListener('visibilitychange', () => {

  if (
    document.visibilityState === 'visible' &&
    wantsPlayback &&
    radio.paused
  ) {
    recoverRadio();
  }

});


window.addEventListener('pageshow', () => {

  if (wantsPlayback && radio.paused) {
    recoverRadio();
  }

});


/* =========================================================
   VOLUME
========================================================= */

volume.addEventListener('input', () => {

  radio.volume = Number(volume.value);

});


/* =========================================================
   ANDROID / LOCK-SCREEN MEDIA CONTROLS
========================================================= */

function updateMediaPlaybackState(value) {

  if ('mediaSession' in navigator) {

    try {
      navigator.mediaSession.playbackState = value;
    } catch (error) {
      // Some browsers may not support playbackState.
    }

  }

}


if ('mediaSession' in navigator) {

  /*
   * Information shown on Android lock screen /
   * notification media controls.
   */

  navigator.mediaSession.metadata =
    new MediaMetadata({

      title: 'Fenland Angels Radio',

      artist: 'The Sound of the Fens',

      album: 'Live Radio',

      artwork: [
        {
          src: './icon-192.png',
          sizes: '192x192',
          type: 'image/png'
        },
        {
          src: './icon-512.png',
          sizes: '512x512',
          type: 'image/png'
        }
      ]

    });


  /*
   * LOCK-SCREEN PLAY
   */

  navigator.mediaSession.setActionHandler(
    'play',
    async () => {

      wantsPlayback = true;

      await startRadio();

    }
  );


  /*
   * LOCK-SCREEN PAUSE
   *
   * This is the important part that the previous version
   * was missing.
   */

  navigator.mediaSession.setActionHandler(
    'pause',
    () => {

      stopRadio();

    }
  );


  /*
   * Radio is live, so seek controls are deliberately disabled.
   */

  try {
    navigator.mediaSession.setActionHandler(
      'seekbackward',
      null
    );

    navigator.mediaSession.setActionHandler(
      'seekforward',
      null
    );
  } catch (error) {
    // Ignore unsupported media actions.
  }

}


/* =========================================================
   SERVICE WORKER
========================================================= */

if ('serviceWorker' in navigator) {

  window.addEventListener('load', () => {

    navigator.serviceWorker
      .register('./service-worker.js?v=6')
      .catch(() => {});

  });

}


/* =========================================================
   INSTALL APP
========================================================= */

let deferredPrompt = null;

const installButton =
  document.getElementById('installApp');

const installHint =
  document.getElementById('installHint');


window.addEventListener(
  'beforeinstallprompt',
  (event) => {

    event.preventDefault();

    deferredPrompt = event;

    if (installButton) {
      installButton.style.display = 'inline-block';
    }

    if (installHint) {
      installHint.textContent =
        'Fenland Angels Radio is ready to install.';
    }

  }
);


if (installButton) {

  installButton.addEventListener(
    'click',
    async () => {

      if (deferredPrompt) {

        deferredPrompt.prompt();

        const result =
          await deferredPrompt.userChoice;

        if (
          result.outcome === 'accepted' &&
          installHint
        ) {

          installHint.textContent =
            'Fenland Angels Radio installed.';

        }

        deferredPrompt = null;

        return;
      }


      const isIOS =
        /iphone|ipad|ipod/i.test(
          navigator.userAgent
        );


      if (installHint) {

        if (isIOS) {

          installHint.textContent =
            'On iPhone or iPad: tap Share, then choose Add to Home Screen.';

        } else {

          installHint.textContent =
            'If installation does not appear, open this page in Chrome or Edge and choose Install App from the browser menu.';

        }

      }

    }
  );

}


/* =========================================================
   APP INSTALLED
========================================================= */

window.addEventListener(
  'appinstalled',
  () => {

    if (installHint) {

      installHint.textContent =
        'Fenland Angels Radio is installed.';

    }

    if (installButton) {

      installButton.textContent =
        '✓ App Installed';

    }

  }
);


/* =========================================================
   HIDE INSTALL CONTROLS WHEN RUNNING AS APP
========================================================= */

const runningAsApp =

  window.matchMedia(
    '(display-mode: standalone)'
  ).matches ||

  window.navigator.standalone === true;


if (runningAsApp) {

  if (installButton) {
    installButton.style.display = 'none';
  }

  if (installHint) {
    installHint.style.display = 'none';
  }

}
