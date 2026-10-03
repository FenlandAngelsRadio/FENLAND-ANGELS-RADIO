(async function(){
  'use strict';
  const el=id=>document.getElementById(id);
  const preview=['localhost','127.0.0.1'].includes(location.hostname)&&new URLSearchParams(location.search).get('preview')==='example';
  const urls={station:'https://localhost:25433/',remote:'https://trj5kt.playitradio.com:25433/'};
  function updateDestination(){el('openStudio').href=urls[el('studioLocation').value];}
  el('studioLocation').onchange=()=>{updateDestination();el('studioHelp').textContent='Location changed. Press Open studio here to connect to this location.';};
  el('connectStudio').onclick=()=>{
    if(preview){el('studioHelp').textContent='Preview only. No live studio or microphone connection is opened.';return;}
    el('studioFrame').src=urls[el('studioLocation').value];el('studioFrame').hidden=false;el('setupBanner').open=false;document.body.classList.add('studio-open');
    el('studioHelp').textContent='If the studio stays blank, use Separate window. Check Live Audio before your show.';
  };
  el('focusCalls').onclick=()=>{const only=el('studioLayout').classList.toggle('calls-only');el('focusCalls').textContent=only?'Show studio and calls':'Call controls only';};
  function separatePanel(kind){
    if(preview){el('studioHelp').textContent='Preview only. No live window or audio connection is opened.';return;}
    const url=kind==='studio'?urls[el('studioLocation').value]:'far-call-centre.html?workspace=1';
    const opened=window.open(url,kind==='studio'?'FARRemoteStudio':'FARCallControls','popup,width='+ (kind==='studio'?1200:650)+',height=850');
    if(opened)el('studioHelp').textContent='Separate window opened. Move it to another screen if needed. Closing this workspace does not close that window.';
    else el('studioHelp').textContent='The browser blocked the separate window. Use the studio link in Setup, or open Call Centre from Cloud Live in a new window.';
  }
  el('detachStudio').onclick=()=>separatePanel('studio');
  el('detachCalls').onclick=()=>separatePanel('calls');
  updateDestination();
  try{
    if(preview){el('callsFrame').src='far-call-centre.html?workspace=1&preview=example';el('openStudio').removeAttribute('href');}
    else{
      const cfg=window.FAR_EVENTS_CONFIG;
      if(!cfg?.SUPABASE_URL||!cfg?.SUPABASE_ANON_KEY)throw new Error('FAR sign-in is unavailable.');
      const db=supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY);
      const {data:{session}}=await db.auth.getSession();
      if(!session){location.replace('admin-dashboard.html');return;}
      const {data,error}=await db.from('far_admins').select('role,permissions').eq('user_id',session.user.id).maybeSingle();
      if(error||!data||(!['owner','deputy_manager'].includes(String(data.role||'').toLowerCase())&&!data.permissions?.includes('cloud_live')))throw new Error('Your account does not have Cloud Live access.');
    }
    el('workspace').hidden=false;el('accessStatus').textContent=preview?'Example workspace — no live audio.':'Staff access confirmed — check call status before your show.';
  }catch(error){el('accessStatus').textContent=error.message||'Staff access could not be confirmed.';}
})();
