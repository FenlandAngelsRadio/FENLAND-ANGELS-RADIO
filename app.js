
const radio=document.getElementById('radio');
const play=document.getElementById('playButton');
const icon=document.getElementById('playIcon');
const state=document.getElementById('state');
const volume=document.getElementById('volume');
play.addEventListener('click',async()=>{
  if(radio.paused){
    state.textContent='Connecting…';
    try{await radio.play();icon.textContent='❚❚';state.textContent='Playing live';}
    catch(e){state.textContent='Unable to connect — tap again';}
  }else{radio.pause();icon.textContent='▶';state.textContent='Paused';}
});
volume.addEventListener('input',()=>radio.volume=volume.value);
radio.volume=.8;
radio.addEventListener('playing',()=>{icon.textContent='❚❚';state.textContent='Playing live';});
radio.addEventListener('waiting',()=>state.textContent='Connecting…');
radio.addEventListener('error',()=>state.textContent='Stream unavailable');

if('serviceWorker' in navigator) window.addEventListener('load',()=>navigator.serviceWorker.register('./service-worker.js').catch(()=>{}));
let promptEvent=null;
const install=document.getElementById('installButton'),help=document.getElementById('installHelp');
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();promptEvent=e;install.style.display='block';});
install.addEventListener('click',async()=>{
 if(promptEvent){promptEvent.prompt();await promptEvent.userChoice;promptEvent=null;}
 else help.textContent=/iphone|ipad|ipod/i.test(navigator.userAgent)?'Safari → Share → Add to Home Screen.':'Browser menu → Install app / Add to Home screen.';
});
window.addEventListener('appinstalled',()=>{install.style.display='none';help.textContent='Fenland Angels Radio is installed.';});
