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

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js').catch(()=>{}));
}
let deferredInstallPrompt=null;
const headerInstall=document.getElementById('installApp');
const mainInstall=document.getElementById('installAppMain');
const installHelp=document.getElementById('installHelp');

window.addEventListener('beforeinstallprompt',event=>{
  event.preventDefault();
  deferredInstallPrompt=event;
  if(headerInstall) headerInstall.hidden=false;
});

async function installFenlandApp(){
  if(deferredInstallPrompt){
    deferredInstallPrompt.prompt();
    const result=await deferredInstallPrompt.userChoice;
    deferredInstallPrompt=null;
    if(headerInstall) headerInstall.hidden=true;
    if(result.outcome==='accepted'&&installHelp) installHelp.textContent='Fenland Angels Radio has been added to your device.';
    return;
  }
  const isIOS=/iphone|ipad|ipod/i.test(navigator.userAgent);
  if(installHelp){
    installHelp.textContent=isIOS
      ? 'On iPhone/iPad: open this page in Safari, tap Share, then choose “Add to Home Screen”.'
      : 'Use your browser menu and choose “Install app” or “Add to Home screen”.';
  }
}
if(headerInstall) headerInstall.addEventListener('click',installFenlandApp);
if(mainInstall) mainInstall.addEventListener('click',installFenlandApp);
window.addEventListener('appinstalled',()=>{if(headerInstall)headerInstall.hidden=true; if(installHelp)installHelp.textContent='Fenland Angels Radio is installed and ready to use.';});
