const radio=document.getElementById('radio');
const play=document.getElementById('play');
const state=document.getElementById('state');
const volume=document.getElementById('volume');

radio.volume=.8;

play.addEventListener('click',async()=>{
  if(radio.paused){
    state.textContent='Connecting…';
    try{
      // Discard the previous connection so Play returns to the live programme.
      radio.load();
      await radio.play();
    }catch(e){
      state.textContent='Could not connect';
    }
  }else{
    radio.pause();
  }
});

radio.addEventListener('playing',()=>{
  if(window.FARAnalytics) window.FARAnalytics.startListening('pwa');
  play.textContent='❚❚';
  state.textContent='Playing live';
});

radio.addEventListener('pause',()=>{
  if(window.FARAnalytics) window.FARAnalytics.stopListening('pwa');
  play.textContent='▶';
  if(radio.currentTime!==0)
    state.textContent='Paused';
});

radio.addEventListener('waiting',()=>{
  state.textContent='Connecting…';
});

radio.addEventListener('error',()=>{
  if(window.FARAnalytics) window.FARAnalytics.stopListening('pwa');
  state.textContent='Stream unavailable';
});

volume.addEventListener('input',()=>{
  radio.volume=Number(volume.value);
});

if('serviceWorker' in navigator){
  let reloadingForWorker=false;
  navigator.serviceWorker.addEventListener('controllerchange',()=>{
    if(reloadingForWorker) return;
    reloadingForWorker=true;
    location.reload();
  });
  window.addEventListener('load',async()=>{
    try{
      const reg=await navigator.serviceWorker.register('./service-worker.js?v=14',{updateViaCache:'none'});
      await reg.update();
      setInterval(()=>reg.update().catch(()=>{}),60000);
    }catch(e){}
  });
}

let deferredPrompt = null;

const installButton = document.getElementById('installApp');
const installHint = document.getElementById('installHint');

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredPrompt = event;

  installButton.style.display = 'inline-block';
  installHint.textContent =
    'Fenland Angels Radio is ready to install.';
});

installButton.addEventListener('click', async () => {

  if (deferredPrompt) {
    deferredPrompt.prompt();

    const result = await deferredPrompt.userChoice;

    if (result.outcome === 'accepted') {
      installHint.textContent =
        'Fenland Angels Radio installed.';
    }

    deferredPrompt = null;
    return;
  }

  const isIOS =
    /iphone|ipad|ipod/i.test(navigator.userAgent);

  if (isIOS) {
    installHint.textContent =
      'On iPhone or iPad: tap Share, then choose Add to Home Screen.';
  } else {
    installHint.textContent =
      'If installation does not appear, open this page in Chrome or Edge and choose Install App from the browser menu.';
  }
});

window.addEventListener('appinstalled', () => {
  if(window.FARAnalytics) window.FARAnalytics.send('app_install',{source:'pwa'});
  installHint.textContent =
    'Fenland Angels Radio is installed.';

  installButton.textContent =
    '✓ App Installed';
});

// Hide the install button when running as an installed app
const runningAsApp =
  window.matchMedia('(display-mode: standalone)').matches ||
  window.navigator.standalone === true;

if (runningAsApp) {
  const installButton =
    document.getElementById('installApp');

  const installHint =
    document.getElementById('installHint');

  if (installButton)
    installButton.style.display='none';

  if (installHint)
    installHint.style.display='none';
}
