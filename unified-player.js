/* Shared schedule presentation only; playback and analytics remain in their existing modules. */
(function(){
  const artwork=document.getElementById('currentShowImage'),name=document.getElementById('currentShowName'),time=document.getElementById('currentShowTime');
  const fallback=new URL('fenland-angels-radio-logo.jpg',new URL(document.currentScript.src)).href;
  if(artwork)artwork.addEventListener('error',()=>{if(artwork.src!==fallback)artwork.src=fallback;});
  async function update(){
    if(!window.FARCMS)return;
    try{
      const show=FARCMS.current(await FARCMS.schedule());
      if(name)name.textContent=show?show.show_name:'Fenland Angels Radio';
      if(time)time.textContent=show?show.start_time.slice(0,5)+' – '+show.end_time.slice(0,5)+' · UK time':'View the programme schedule';
      if(artwork){artwork.src=show&&show.image?new URL(show.image,new URL('./',fallback)).href:fallback;artwork.alt=show?show.show_name+' programme artwork':'Fenland Angels Radio';}
    }catch(_){/* Retain the last successfully loaded programme during a temporary outage. */}
  }
  const audio=document.getElementById('radioStream')||document.getElementById('radio'),button=document.getElementById('mainPlay')||document.getElementById('play');
  if(audio&&button){const reflect=()=>{button.setAttribute('aria-pressed',String(!audio.paused));button.setAttribute('aria-label',(audio.paused?'Play':'Pause')+' Fenland Angels Radio');};['playing','pause','ended','error'].forEach(e=>audio.addEventListener(e,reflect));reflect();}
  const slider=document.getElementById('volume'),percent=document.getElementById('volumePercent'),mute=document.getElementById('playerMute');
  if(audio&&slider&&percent&&mute){
    const reflectVolume=()=>{const silent=audio.muted||Number(slider.value)===0;percent.value=Math.round(Number(slider.value)*100)+'%';mute.textContent=silent?'🔇':'🔊';mute.setAttribute('aria-label',silent?'Unmute audio':'Mute audio');mute.setAttribute('aria-pressed',String(silent));};
    slider.addEventListener('input',()=>{if(audio.muted&&Number(slider.value)>0)audio.muted=false;reflectVolume();});
    mute.addEventListener('click',()=>{if(Number(slider.value)===0){slider.value='0.5';slider.dispatchEvent(new Event('input',{bubbles:true}));audio.muted=false;}else audio.muted=!audio.muted;reflectVolume();});
    audio.addEventListener('volumechange',reflectVolume);reflectVolume();
  }
  update();setInterval(update,60000);
})();

