const API='https://ec5.yesstreaming.net:2150';
const WEBPLAYER='https://ec5.yesstreaming.net:2150/api/links/?t=web&l=diamondangelsso2&c=1';
const SERVER_ID=1;
const audio=document.getElementById('radio');
const playBtn=document.getElementById('playBtn');
const statusEl=document.getElementById('status');
const nowEl=document.getElementById('nowPlaying');
const directLink=document.getElementById('directLink');
let streamUrl='';
async function getJson(url){const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw new Error('HTTP '+r.status);return r.json()}
async function loadStation(){
  try{
    const channels=await getJson(`${API}/channels/?server=${SERVER_ID}`);
    const channel=(channels||[]).find(c=>c.active)||channels?.[0];
    if(!channel) throw new Error('No active channel');
    streamUrl=channel.secure_stream_url||channel.stream_url||'';
    if(streamUrl){audio.src=streamUrl;directLink.href=streamUrl;statusEl.textContent='Live stream ready';}
    try{
      const history=await getJson(`${API}/history/?limit=1&offset=0&server=${SERVER_ID}`);
      const item=history?.results?.[0];
      if(item?.metadata) nowEl.textContent=item.metadata;
    }catch(e){}
  }catch(e){
    statusEl.textContent='Live stream available via YesStreaming';
    directLink.href=WEBPLAYER;
  }
}
playBtn.addEventListener('click',async()=>{
  if(!streamUrl && !audio.src){await loadStation();}
  if(audio.paused){
    try{await audio.play();playBtn.textContent='❚❚';statusEl.textContent='LIVE NOW';}
    catch(e){statusEl.textContent='Opening live web player…'; window.open(WEBPLAYER,'_blank','noopener');}
  }else{audio.pause();playBtn.textContent='▶';statusEl.textContent='Paused';}
});
audio.addEventListener('playing',()=>{playBtn.textContent='❚❚';statusEl.textContent='LIVE NOW'});
audio.addEventListener('pause',()=>{playBtn.textContent='▶'});
audio.addEventListener('error',()=>{statusEl.textContent='Use the direct player link below'});
loadStation();
setInterval(async()=>{try{const h=await getJson(`${API}/history/?limit=1&offset=0&server=${SERVER_ID}`);const item=h?.results?.[0];if(item?.metadata)nowEl.textContent=item.metadata}catch(e){}},15000);
