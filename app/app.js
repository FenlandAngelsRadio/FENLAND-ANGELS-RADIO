const radio=document.getElementById('radio');
const play=document.getElementById('play');
const state=document.getElementById('state');
const volume=document.getElementById('volume');
radio.volume=.8;
play.addEventListener('click',async()=>{
  if(radio.paused){
    state.textContent='Connecting…';
    try{await radio.play();}catch(e){state.textContent='Could not connect';}
  }else{radio.pause();}
});
radio.addEventListener('playing',()=>{play.textContent='❚❚';state.textContent='Playing live';});
radio.addEventListener('pause',()=>{play.textContent='▶';if(radio.currentTime!==0)state.textContent='Paused';});
radio.addEventListener('waiting',()=>state.textContent='Connecting…');
radio.addEventListener('error',()=>state.textContent='Stream unavailable');
volume.addEventListener('input',()=>radio.volume=Number(volume.value));

if('serviceWorker' in navigator){
  window.addEventListener('load',()=>navigator.serviceWorker.register('./service-worker.js?v=3').catch(()=>{}));
}
let deferredPrompt = null;

const installButton = document.getElementById('installApp');
const installHint = document.getElementById('installHint');

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredPrompt = event;

  installButton.style.display = 'inline-block';
  installHint.textContent = 'Fenland Angels Radio is ready to install.';
});

installButton.addEventListener('click', async () => {

  if (deferredPrompt) {
    deferredPrompt.prompt();

    const result = await deferredPrompt.userChoice;

    if (result.outcome === 'accepted') {
      installHint.textContent = 'Fenland Angels Radio installed.';
    }

    deferredPrompt = null;
    return;
  }

  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);

  if (isIOS) {
    installHint.textContent =
      'On iPhone or iPad: tap Share, then choose Add to Home Screen.';
  } else {
    installHint.textContent =
      'If installation does not appear, open this page in Chrome or Edge and choose Install App from the browser menu.';
  }
});

window.addEventListener('appinstalled', () => {
  installHint.textContent = 'Fenland Angels Radio is installed.';
  installButton.textContent = '✓ App Installed';
});
