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
