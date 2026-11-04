/* Shared staff room. Server checks membership and supplies author identity. */
(() => {
  'use strict';
  const config=window.FAR_EVENTS_CONFIG;
  const client=supabase.createClient(config.SUPABASE_URL,config.SUPABASE_ANON_KEY);
  const $=id=>document.getElementById(id),list=$('chatMessages');
  let user=null,authBusy=false,loadBusy=false,sendBusy=false,timer=null,generation=0;
  let newest=null,oldest=null,pending=null;const seen=new Set();
  function status(text,error=false){$('chatConnection').textContent=text;$('chatConnection').classList.toggle('chat-error',error);}
  function reset(){generation++;clearInterval(timer);timer=null;user=null;newest=oldest=null;pending=null;seen.clear();list.replaceChildren();$('chatPanel').hidden=true;$('chatLogin').hidden=false;$('olderMessages').hidden=true;$('messageText').value='';$('messageCount').textContent='0 / 2000';$('sendStatus').textContent='';}
  function bottom(){list.scrollTop=list.scrollHeight;$('newMessageNotice').hidden=true;}
  function render(rows,prepend=false,force=false){
    const atBottom=list.scrollHeight-list.scrollTop-list.clientHeight<70,oldHeight=list.scrollHeight,frag=document.createDocumentFragment();
    for(const m of rows){
      const id=String(m.id);if(seen.has(id))continue;seen.add(id);
      if(newest===null||BigInt(id)>BigInt(newest))newest=id;if(oldest===null||BigInt(id)<BigInt(oldest))oldest=id;
      const article=document.createElement('article');article.className='chat-message'+(m.author_id===user?.id?' mine':'');article.dataset.id=id;
      const header=document.createElement('header'),author=document.createElement('strong'),time=document.createElement('time'),body=document.createElement('p');
      author.textContent=m.author_name;time.dateTime=m.created_at;time.textContent=new Date(m.created_at).toLocaleString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});time.title=new Date(m.created_at).toLocaleString('en-GB');body.textContent=m.body;
      header.append(author,time);article.append(header,body);frag.append(article);
    }
    list.querySelector('.chat-empty')?.remove();
    if(prepend){list.prepend(frag);list.scrollTop+=list.scrollHeight-oldHeight;}else list.append(frag);
    if(!seen.size){const p=document.createElement('p');p.className='chat-empty';p.textContent='No messages yet. Start the team conversation.';list.append(p);}
    if(!prepend&&(force||atBottom))bottom();else if(!prepend&&rows.length)$('newMessageNotice').hidden=false;
  }
  async function load(older=false){
    if(!user||loadBusy)return;loadBusy=true;const current=generation;
    $('olderMessages').disabled=true;$('refreshChat').disabled=true;
    try{
      let q=client.from('far_team_chat').select('id,author_id,author_name,body,created_at').limit(50);
      const initial=newest===null;
      if(older&&oldest!==null)q=q.lt('id',oldest).order('id',{ascending:false});
      else if(!initial)q=q.gt('id',newest).order('id',{ascending:true});
      else q=q.order('id',{ascending:false});
      const {data,error}=await q;if(current!==generation)return;if(error)throw error;
      const rows=(initial||older)?[...(data||[])].reverse():(data||[]);render(rows,older,initial);
      if(initial||older)$('olderMessages').hidden=(data||[]).length<50;
      status('Up to date · refreshes every 15 seconds');
    }catch(e){if(current===generation)status('Could not refresh. Your draft is safe. Use Refresh to retry.',true);}
    finally{loadBusy=false;$('olderMessages').disabled=false;$('refreshChat').disabled=false;}
  }
  async function auth(){
    if(authBusy)return;authBusy=true;
    try{
      const {data:{session},error}=await client.auth.getSession();if(error)throw error;
      if(!session){reset();return;}
      const {data:staff,error:staffError}=await client.from('far_admins').select('display_name').eq('user_id',session.user.id).maybeSingle();
      if(staffError)throw staffError;if(!staff){reset();$('loginStatus').textContent='This room is for authorised FAR staff. Contact station management if you need access.';return;}
      if(user?.id===session.user.id)return;
      reset();user=session.user;$('chatLogin').hidden=true;$('chatPanel').hidden=false;$('chatPassword').value='';$('chatIdentity').textContent='Signed in as '+(staff.display_name||'FAR colleague');
      await load();timer=setInterval(()=>{if(!document.hidden)load();},15000);
    }catch(e){reset();$('loginStatus').textContent='Unable to check your staff access. Please try again.';}
    finally{authBusy=false;}
  }
  $('loginForm').addEventListener('submit',async e=>{e.preventDefault();$('loginButton').disabled=true;$('loginStatus').textContent='Signing in…';
    try{const {error}=await client.auth.signInWithPassword({email:$('chatEmail').value.trim(),password:$('chatPassword').value});if(error)throw error;$('loginStatus').textContent='';await auth();}
    catch(e){$('loginStatus').textContent=e.message||'Sign-in failed.';}finally{$('loginButton').disabled=false;}
  });
  $('messageText').addEventListener('input',()=>{$('messageCount').textContent=$('messageText').value.length+' / 2000';});
  $('messageText').addEventListener('keydown',e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)&&!e.isComposing){e.preventDefault();$('messageForm').requestSubmit();}});
  $('messageForm').addEventListener('submit',async e=>{
    e.preventDefault();const body=$('messageText').value.trim();if(!user||sendBusy||!body)return;
    if(!pending||pending.body!==body)pending={body,id:crypto.randomUUID()};
    sendBusy=true;$('sendMessage').disabled=true;$('sendStatus').textContent='Sending…';const current=generation;
    try{
      const {data,error}=await client.rpc('far_team_chat_send',{p_body:body,p_client_id:pending.id});if(error)throw error;if(current!==generation)return;
      // Fetch in order: rendering only the returned message could skip unseen colleagues' messages.
      if($('messageText').value.trim()===body){$('messageText').value='';$('messageCount').textContent='0 / 2000';}
      pending=null;$('sendStatus').textContent='Message sent.';await load();bottom();
    }catch(e){if(current===generation)$('sendStatus').textContent=(e.message||'Message not sent.')+' Your draft has been kept.';}
    finally{sendBusy=false;$('sendMessage').disabled=false;}
  });
  $('refreshChat').onclick=()=>load();$('olderMessages').onclick=()=>load(true);$('jumpLatest').onclick=bottom;
  list.addEventListener('scroll',()=>{if(list.scrollHeight-list.scrollTop-list.clientHeight<70)$('newMessageNotice').hidden=true;});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&user)load();});
  client.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT')reset();else if(event==='SIGNED_IN')setTimeout(auth,0);});
  window.addEventListener('pagehide',()=>clearInterval(timer));auth();
})();
