/* Phone/audio adapters are required; localhost examples never contact them. */
(async function () {
  const el = id => document.getElementById(id);
  const status = (message, error = false) => {
    el('callStatus').textContent = message;
    el('callStatus').classList.toggle('error', error);
  };
  const demo = ['localhost','127.0.0.1'].includes(location.hostname)
    && new URLSearchParams(location.search).get('preview') === 'example';
  let db, me, snapshot, busy = false, pending;
  let alertsEnabled=false, seenCalls=new Set(), alertsInitialised=false;
  const management = () => ['owner','deputy_manager'].includes(me?.role);
  const names = {waiting:'Waiting',screening:'Being screened',ready:'Ready — off air',held:'On hold',on_air:'On air',muted:'Muted',private_answered:'Answered privately'};
  const actions = {waiting:['screen','end'],screening:['ready','hold','end'],ready:['put_on_air','hold','end'],held:['screen','end'],on_air:['mute','hold','end'],muted:['put_on_air','hold','end'],private_answered:['end']};
  const labels = {screen:'Screen privately',ready:'Screened — ready',put_on_air:'Put on air',hold:'Hold',mute:'Mute caller now',end:'End call',answer_private:'Answer privately',voicemail:'Send to voicemail'};
  const descriptions = {ready:'Have you checked their name, topic and suitability, and explained the on-air rules? They will remain off air.',put_on_air:'Listeners will hear this caller. Put them on air now?',end:'Disconnect this caller? They will need to call again to return.',voicemail:'Send this business caller to private voicemail?'};
  function resetExamples() {
    snapshot = {version:1,audio_ready:true,capabilities:{voicemail:true,operator_connected:true,programme_connected:true},private_access:management(),calls:[
      {id:'game',name:'Example game caller',category:'games',source:'phone',state:'waiting'},
      {id:'guest',name:'Example interview caller',category:'show',source:'phone',state:'waiting'},
      ...(management()?[{id:'private',name:'Example business caller',category:'business',source:'phone',state:'waiting'}]:[])
    ]};
  }
  async function api(action, extra={}) {
    const {data:{session}} = await db.auth.getSession();
    if(!session) throw new Error('Your sign-in has expired. Return to Admin Dashboard and sign in again.');
    const cfg=window.FAR_EVENTS_CONFIG;
    const response=await fetch(cfg.SUPABASE_URL+'/functions/v1/far-call-centre',{
      method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+session.access_token,apikey:cfg.SUPABASE_ANON_KEY},
      body:JSON.stringify({action,...extra}),signal:AbortSignal.timeout(12000)
    });
    let result;try{result=await response.json();}catch{throw new Error('The call service could not be reached. Refresh to try again.');}
    if(!response.ok) {const error=new Error(response.status===404||response.status===503?'The phone and guest-call service is not connected yet. No calls can be answered from this screen.':result.error||'The call service could not complete this request.');error.status=response.status;throw error;}
    if(!Array.isArray(result.calls)||!Number.isInteger(result.version)) throw new Error('The call service returned an incomplete update. Refresh before trying again.');
    return result;
  }
  function render() {
    const delay=snapshot.broadcast_delay;
    el('dumpAudio').disabled=busy||!delay?.protected||delay.scope!=='caller';
    el('delayStatus').textContent=demo?'Example screen: no caller delay is connected.':delay?.protected&&delay.scope==='caller'?`${delay.seconds}-second caller delay ready. Dump replaces pending caller audio with silence. Your microphone stays separate.`:delay?.connected?'Delay worker is running, but the caller URL route is not verified. Do not rely on Dump.':'Live caller delay is not connected. Dump is unavailable.';
    const capabilities=snapshot.capabilities||{};
    el('connectionHelp').textContent=demo?'Example connections only — no live phone or programme audio.':!snapshot.audio_ready?'Phone audio is not connected.':!capabilities.operator_connected?'Connect your staff calling app before screening or answering privately.':!capabilities.programme_connected?'Your private audio connection is ready. Programme audio is not connected; callers cannot go on air.':'Your staff audio and programme connection are ready.';
    el('privatePanel').hidden=!management()||!snapshot.private_access;
    for(const category of ['games','show','business']) {
      const target=el(category+'Calls');target.replaceChildren();
      const calls=snapshot.calls.filter(c=>c.category===category&&(category!=='business'||management()));
      if(!calls.length){const p=document.createElement('p');p.className='muted';p.textContent=demo?'No example calls waiting.':'No calls waiting.';target.append(p);}
      for(const call of calls) {
        const card=document.createElement('article');card.className='caller';
        const heading=document.createElement('div');heading.className='caller-heading';
        const name=document.createElement('strong');name.textContent=call.name;
        const stage=document.createElement('span');stage.className='call-stage';stage.textContent=names[call.state]||'Status unavailable';heading.append(name,stage);
        const source=document.createElement('p');source.className='muted';source.textContent=(call.source==='guest'?'Browser guest':'Phone caller')+(call.claimed_by&&call.claimed_by!==me.id?' · Another team member is handling this call.':'');
        const buttons=document.createElement('div');buttons.className='call-actions';
        const available=category==='business'?(call.state==='waiting'?['answer_private','voicemail','end']:['end']):actions[call.state]||[];
        for(const action of available){
          const button=document.createElement('button');button.type='button';button.textContent=labels[action];
          button.className=['end','mute'].includes(action)?'danger':action==='put_on_air'?'primary':'';
          if(action==='end'&&['on_air','muted'].includes(call.state))button.textContent='End caller now';
          button.disabled=busy||!snapshot.audio_ready||Boolean(call.claimed_by&&call.claimed_by!==me.id)||(action==='voicemail'&&!snapshot.capabilities?.voicemail);
          if(['screen','answer_private'].includes(action)&&!capabilities.operator_connected)button.disabled=true;
          if(action==='put_on_air'&&!capabilities.programme_connected)button.disabled=true;
          if(action==='voicemail'&&!snapshot.capabilities?.voicemail)button.title='Private voicemail is not connected yet.';
          button.onclick=()=>requestAction(call,action);buttons.append(button);
        }
        card.append(heading,source,buttons);target.append(card);
      }
    }
    el('refreshCalls').disabled=busy;
  }
  function notifyArrivals(){
    const waiting=snapshot.calls.filter(c=>c.state==='waiting');
    const arrived=waiting.filter(c=>!seenCalls.has(c.id));
    if(alertsEnabled&&alertsInitialised&&arrived.length){
      if('Notification' in window&&Notification.permission==='granted')new Notification('FAR: caller waiting',{body:arrived.length===1?'A new caller is waiting. Open Call Centre to check the queue.':arrived.length+' new callers are waiting.',tag:'far-calls'});
      if(navigator.vibrate)navigator.vibrate([150,80,150]);
      status('New caller waiting. Check the queue before answering.');
    }
    seenCalls=new Set(snapshot.calls.map(c=>c.id));alertsInitialised=true;
    document.title=waiting.length?'('+waiting.length+') Call Centre | FAR Cloud Live':'Call Centre | FAR Cloud Live';
  }
  function requestAction(call,action){
    if(descriptions[action]&&!(action==='end'&&['on_air','muted'].includes(call.state))){
      pending={id:call.id,action,version:snapshot.version};
      el('confirmText').textContent=call.name+': '+descriptions[action];el('callConfirm').hidden=false;
      el('confirmAction').focus();
    } else perform(call.id,action,snapshot.version);
  }
  async function perform(id,action,version){
    if(busy)return;busy=true;render();el('callConfirm').hidden=true;pending=null;
    try{
      if(demo){
        const call=snapshot.calls.find(c=>c.id===id);
        if(action==='put_on_air'&&snapshot.calls.some(c=>c.id!==id&&['on_air','muted'].includes(c.state)))throw new Error('Hold or end the current example on-air caller first.');
        if(['end','voicemail'].includes(action))snapshot.calls=snapshot.calls.filter(c=>c.id!==id);
        else{call.state={screen:'screening',ready:'ready',put_on_air:'on_air',hold:'held',mute:'muted',answer_private:'private_answered'}[action];call.claimed_by=action==='hold'?null:me.id;}
        snapshot.version++;status('Example updated. No live audio or phone call was changed.');
      }else{
        try{snapshot=await api('act',{id,operation:action,version});}
        catch(error){
          // An automatic queue refresh must not force a second emergency click.
          if(error.status!==409||!['mute','end'].includes(action))throw error;
          snapshot=await api('list');
          const current=snapshot.calls.find(c=>c.id===id);
          if(!current){status('Caller has already disconnected.');return;}
          if(!['on_air','muted'].includes(current.state)||current.claimed_by!==me.id)throw error;
          if(action==='mute'&&current.state==='muted'){status('Caller is already muted.');return;}
          snapshot=await api('act',{id,operation:action,version:snapshot.version});
        }
        status(action==='mute'?'Caller muted. Audio already transmitted cannot be recalled.':action==='end'?'Caller disconnected.':'Call updated.');
      }
    }catch(error){status(error.message||'The action could not be confirmed. Refresh before trying again.',true);if(!demo)snapshot.audio_ready=false;}
    finally{busy=false;render();}
  }
  async function refresh(background=false){
    if(busy||background&&(pending||!snapshot?.audio_ready))return;busy=true;
    if(snapshot&&!demo&&!background){snapshot.audio_ready=false;render();}
    try{
      if(!demo)snapshot=await api('list');
      notifyArrivals();
      if(!background)status(demo?'Example call centre — no live connections.':snapshot.audio_ready?'Call centre connected. Queues update automatically. Callers stay off air until you choose Put on air.':'Call queues connected; audio controls are not set up yet.');
    }catch(error){status(error.message||'Call service unavailable. Refresh to try again.',true);snapshot={calls:[],version:0,audio_ready:false,private_access:management()};}
    finally{busy=false;render();}
  }
  el('confirmAction').onclick=()=>{if(pending)perform(pending.id,pending.action,pending.version);};
  el('cancelAction').onclick=()=>{pending=null;el('callConfirm').hidden=true;};
  el('refreshCalls').onclick=()=>refresh();
  el('dumpAudio').onclick=async()=>{
    if(busy||!snapshot?.broadcast_delay?.protected||snapshot.broadcast_delay.scope!=='caller')return;
    busy=true;render();const started=performance.now();
    status('Dump requested — waiting for the audio service to confirm.');
    try{snapshot=await api('delay_dump');status(`Buffered caller audio replaced. Confirmation took ${((performance.now()-started)/1000).toFixed(1)} seconds. Your microphone remains separate.`);}
    catch(error){if(snapshot.broadcast_delay)snapshot.broadcast_delay.protected=false;status(error.message||'Dump could not be confirmed. Mute or end the caller and check the studio.',true);}
    finally{busy=false;render();}
  };
  el('enableAlerts').onclick=async()=>{
    if(!('Notification' in window)){status('This browser does not support call notifications. Keep the queue visible.');return;}
    const permission=await Notification.requestPermission();alertsEnabled=permission==='granted';
    el('enableAlerts').textContent=alertsEnabled?'Call alerts enabled while this screen is open':'Notifications not allowed — check browser settings';
  };
  el('resetExamples').onclick=()=>{pending=null;el('callConfirm').hidden=true;resetExamples();render();status('Example calls reset. No live connections.');};
  try{
    if(demo){const role=new URLSearchParams(location.search).get('example_role')||'owner';me={id:'example',role,permissions:['cloud_live']};el('exampleTools').hidden=false;resetExamples();}
    else{
      const cfg=window.FAR_EVENTS_CONFIG||{};
      if(!cfg.SUPABASE_URL||!cfg.SUPABASE_ANON_KEY)throw new Error('The call centre is not connected yet.');
      db=supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY);
      const {data:{session}}=await db.auth.getSession();if(!session){location.href='admin-dashboard.html';return;}
      const {data,error}=await db.from('far_admins').select('role,permissions').eq('user_id',session.user.id).maybeSingle();
      if(error||!data)throw new Error('Your staff access could not be checked. Return to Admin Dashboard.');
      me={...data,id:session.user.id,role:String(data.role||'').toLowerCase()};
      if(!management()&&!Array.isArray(me.permissions))me.permissions=[];
      if(!management()&&!me.permissions.includes('cloud_live'))throw new Error('Your account does not have Cloud Live access.');
    }
    el('callApp').hidden=false;await refresh();
    if(!demo && management() && window.FARPhoneMenu)window.FARPhoneMenu.init(me,db);
    if(!demo)setInterval(()=>refresh(true),5000);
  }catch(error){status(error.message,true);}
})();
