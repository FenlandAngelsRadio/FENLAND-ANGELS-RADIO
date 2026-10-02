/* Owner/Deputy controls; the server independently checks every action. */
window.FARPhoneMenu={async init(me,db){
  if(!['owner','deputy_manager'].includes(me.role))return;
  const el=id=>document.getElementById(id);
  let settings, busy=false;
  const say=text=>{el('phoneMenuStatus').textContent=text;};
  async function api(action,extra={}){
    const {data:{session}}=await db.auth.getSession();
    if(!session)throw Error('Sign in again before changing the phone menu.');
    const cfg=window.FAR_EVENTS_CONFIG;
    const response=await fetch(cfg.SUPABASE_URL+'/functions/v1/far-call-centre',{
      method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.access_token,apikey:cfg.SUPABASE_ANON_KEY},
      body:JSON.stringify({action,...extra}),signal:AbortSignal.timeout(45000)});
    const result=await response.json();if(!response.ok)throw Error(result.error||'The change could not be confirmed.');return result;
  }
  function input(label,value,type='text'){
    const wrap=document.createElement('label');wrap.textContent=label+' ';
    const control=document.createElement('input');control.type=type;
    if(type==='checkbox')control.checked=value;else control.value=value;
    wrap.append(control);return {wrap,control};
  }
  function draw(){
    el('phoneOptionRows').replaceChildren();
    for(const option of settings.options){
      const row=document.createElement('div');row.className='call-panel';
      const digit=input('Press',option.digit,'number');digit.control.min='1';digit.control.max='9';
      const name=input('Option name',option.label);name.control.maxLength=80;
      const enabled=input('Available to callers',option.enabled,'checkbox');
      const destination=document.createElement('label');destination.textContent='Send caller to ';
      const select=document.createElement('select');
      for(const [value,label] of [['games','Games & competitions'],['show','Live show & interviews'],['business','Private station business']]){
        const choice=document.createElement('option');choice.value=value;choice.textContent=label;select.append(choice);
      }select.value=option.destination;destination.append(select);
      row.append(digit.wrap,name.wrap,destination,enabled.wrap);row._fields={digit:digit.control,label:name.control,destination:select,enabled:enabled.control};
      el('phoneOptionRows').append(row);
    }
  }
  function read(){return [...el('phoneOptionRows').children].map(row=>({digit:row._fields.digit.value,label:row._fields.label.value,destination:row._fields.destination.value,enabled:row._fields.enabled.checked}));}
  async function work(fn){if(busy)return;busy=true;el('phoneSaveOptions').disabled=true;el('phoneAddOption').disabled=true;
    try{await fn();}catch(error){say(error.message||'The change could not be confirmed.');}
    finally{busy=false;el('phoneSaveOptions').disabled=false;el('phoneAddOption').disabled=false;}}
  el('phoneAddOption').onclick=()=>{
    settings.options=read();const used=new Set(settings.options.map(o=>o.digit));const digit='123456789'.split('').find(d=>!used.has(d));
    if(!digit){say('All nine phone options are in use. Disable an existing option to stop callers using it.');return;}
    settings.options.push({digit,label:'New phone option',destination:'show',enabled:false});draw();
  };
  el('phoneSaveOptions').onclick=()=>work(async()=>{
    say('Saving phone menu…');settings=await api('phone_save',{version:settings.version,options:read()});draw();say('Phone menu saved. Update your welcome recording to match these choices.');
  });
  const labels={menu:'Welcome & menu choices',waiting:'Games/interviews waiting message',business:'Connecting private business calls',unavailable:'No menu choice received',voicemail:'Private voicemail greeting'};
  for(const [slot,label] of Object.entries(labels)){
    const panel=document.createElement('section');panel.className='call-panel';const heading=document.createElement('h4');heading.textContent=label;
    const file=input('Choose recording','','file');file.control.accept='audio/*,.m4a,.wav,.mp3';
    const player=document.createElement('audio');player.controls=true;player.hidden=true;
    const upload=document.createElement('button');upload.type='button';upload.textContent='Use this recording';upload.disabled=true;
    let url;
    file.control.onchange=()=>{if(url)URL.revokeObjectURL(url);const selected=file.control.files[0];upload.disabled=!selected;player.hidden=!selected;
      if(selected){url=URL.createObjectURL(selected);player.src=url;}};
    upload.onclick=()=>work(async()=>{
      const selected=file.control.files[0];if(!selected)throw Error('Choose a recording first.');
      if(selected.size>8*1024*1024)throw Error('Choose a recording no larger than 8 MB.');
      upload.disabled=true;const bytes=new Uint8Array(await selected.arrayBuffer());
      const transfer=await api('phone_upload_start',{slot,size:bytes.length});
      for(let offset=0;offset<bytes.length;offset+=7500){
        const part=bytes.subarray(offset,offset+7500);const data=btoa(String.fromCharCode(...part));
        say('Uploading '+label+'… '+Math.round(offset/bytes.length*100)+'%');await api('phone_upload_chunk',{upload:transfer.upload,offset,data});
      }say('Checking and publishing recording…');await api('phone_upload_finish',{upload:transfer.upload});say(label+' updated. The previous recording is retained on the server.');
    }).finally(()=>{upload.disabled=!file.control.files[0];});
    panel.append(heading,file.wrap,player,upload);el('phoneRecordingRows').append(panel);
  }
  el('phoneMenuManager').hidden=false;
  await work(async()=>{settings=await api('phone_settings');draw();say('Phone menu ready. Choose a control below.');});
}};
