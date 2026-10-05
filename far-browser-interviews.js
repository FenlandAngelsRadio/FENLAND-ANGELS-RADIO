(async function(){
  'use strict';
  const el=id=>document.getElementById(id), origin='https://vdo.ninja';
  const preview=['localhost','127.0.0.1'].includes(location.hostname)&&new URLSearchParams(location.search).get('preview')==='example';
  let db, room=null, busy=false, currentId=null, poll, detached=null;
  function send(id,message){const frame=el(id);if(frame.getAttribute('src'))frame.contentWindow.postMessage(message,origin);}
  function closeFrames(){if(detached&&!detached.closed)detached.close();detached=null;for(const id of ['directorFrame','receiverFrame']){send(id,{close:'estop'});el(id).removeAttribute('src');el(id).hidden=true;}}
  function url(kind){
    const params=new URLSearchParams({password:room.password,videodevice:'0'});
    // Speech processing is applied at the source; keep gain neutral.
    if(kind!=='receiver'){
      params.set('compressor','1');params.set('lowcut','80');params.set('equalizer','1');
      params.set('autogain','1');params.set('denoise','1');params.set('echocancellation','1');
      params.set('oab','96');
    }
    if(kind==='director'){params.set('director',room.room);params.set('codirector',room.director_password);params.set('label','FAR Presenter');}
    else{params.set('room',room.room);if(kind==='receiver'){params.set('scene','1');params.set('nodirectoraudio','1');params.set('audiooutput','CABLE_Input');params.set('audiodevice','0');}}
    return origin+'/?'+params;
  }
  function render(result){
    room=result.interview;
    if(currentId!==room?.id){closeFrames();currentId=room?.id||null;}
    el('roomControls').hidden=!room;el('end').disabled=!room||!result.can_control;
    el('director').disabled=!result.can_control;el('separate').disabled=!result.can_control;
    el('copy').disabled=!room;el('receiver').disabled=!room||!result.can_control;el('start').disabled=!!room;el('guestLink').value=room?url('guest'):'';
    el('status').textContent=room?'Room open until '+new Date(room.expires_at*1000).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})+'. Joining is not an on-air confirmation.':'No interview room open.';
  }
  async function request(action){
    const {data,error}=await db.functions.invoke('far-call-centre',{body:{action,id:room?.id}});
    if(error||data?.error)throw new Error(data?.error||'Interview service unavailable. Check the connection before using it.');
    if(!data||!Object.prototype.hasOwnProperty.call(data,'interview'))throw new Error('Interview room response could not be confirmed.');
    return data;
  }
  async function act(action){
    if(busy||preview)return;busy=true;
    try{if(action==='interview_end')closeFrames();render(await request(action));}
    catch(error){el('status').textContent=error.message;closeFrames();el('guestLink').value='';el('copy').disabled=true;el('receiver').disabled=true;el('end').disabled=true;el('director').disabled=true;el('separate').disabled=true;}
    finally{busy=false;}
  }
  el('start').onclick=()=>act('interview_start');el('refresh').onclick=()=>act('interview_state');el('end').onclick=()=>act('interview_end');
  el('copy').onclick=async()=>{try{await navigator.clipboard.writeText(el('guestLink').value);el('copyStatus').textContent='Guest link copied. Send it privately.';}catch{el('guestLink').select();el('copyStatus').textContent='Select and copy the link above.';}};
  el('director').onclick=()=>{if(!room||preview)return;el('directorFrame').src=url('director');el('directorFrame').hidden=false;};
  el('separate').onclick=()=>{if(!room||preview)return;send('directorFrame',{close:true});el('directorFrame').removeAttribute('src');el('directorFrame').hidden=true;const w=detached=window.open(url('director'),'FARInterviewDirector','popup,width=1000,height=850');el('status').textContent=w?'Guest controls opened separately. Keep that window open for the interview.':'The separate window was blocked. Use Open guest controls here.';};
  el('receiver').onclick=()=>{if(!room||preview)return;el('receiverFrame').src=url('receiver');el('receiverFrame').hidden=false;el('receiverStatus').textContent='Receiver opened. Confirm its output is CABLE Input before playing the interview Aux Input. Audio has not yet been verified.';};
  window.addEventListener('message',event=>{
    if(event.origin!==origin||!event.data||typeof event.data!=='object')return;
    if(event.source===el('directorFrame').contentWindow&&event.data.action==='guest-connected')el('status').textContent='A guest joined. Screen them in the guest controls before adding them to S1.';
    if(event.source===el('receiverFrame').contentWindow&&event.data.action==='view-connection')el('receiverStatus').textContent=event.data.value?'Guest receiver has a peer connection. Check cable output and PlayIt Aux Input; this does not prove broadcast audio.':'A guest receiver connection closed. Check the guest controls.';
  });
  try{
    if(preview){el('controls').hidden=false;render({interview:null,can_control:false});el('status').textContent='Example interview panel — no live microphone or guest connections.';return;}
    const cfg=window.FAR_EVENTS_CONFIG;db=supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY);
    const {data:{session}}=await db.auth.getSession();if(!session)throw new Error('Sign in to FAR Admin first.');
    const {data,error}=await db.from('far_admins').select('role,permissions').eq('user_id',session.user.id).maybeSingle();
    if(error||!data||(!['owner','deputy_manager'].includes(String(data.role||'').toLowerCase())&&!data.permissions?.includes('cloud_live')))throw new Error('Cloud Live staff access is required.');
    el('controls').hidden=false;await act('interview_state');poll=setInterval(()=>act('interview_state'),15000);
    db.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT'){clearInterval(poll);closeFrames();el('controls').hidden=true;el('status').textContent='Signed out. Interview controls closed.';}});
    window.addEventListener('pagehide',()=>{clearInterval(poll);closeFrames();});
  }catch(error){el('status').textContent=error.message;}
})();

