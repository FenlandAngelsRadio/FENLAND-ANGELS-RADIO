(function(){
 'use strict';
 const labels={needs_review:'Needs review',in_progress:'In progress',waiting:'Waiting for information',completed:'Completed'};
 const actions={claim:'Took this event',assign:'Reassigned',release:'Released to the team',note:'Added a note',details_saved:'Saved event details',poster_saved:'Saved event dates or image',approved:'Approved and published',rejected:'Rejected',deleted:'Deleted',...labels};
 const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function state(event,work){return work||{event_id:event.id,assigned_to:null,progress:['approved','rejected'].includes(event.status)?'completed':'needs_review',version:0};}
 function matches(view,event,work,uid,upcoming){
  const w=state(event,work);
  switch(view){
   case 'live':return event.status==='approved'&&upcoming(event);
   case 'new':return event.status==='pending'&&!w.assigned_to&&w.progress==='needs_review';
   case 'mine':return w.assigned_to===uid&&w.progress!=='completed';
   case 'progress':return w.progress==='in_progress';
   case 'waiting':return w.progress==='waiting';
   case 'finished':return w.progress==='completed'&&event.status!=='rejected';
   case 'rejected':return event.status==='rejected';
   default:return true;
  }
 }
 class EventWorkflow{
  constructor(db,list,admin,uid){this.db=db;this.list=list;this.admin=admin;this.uid=uid;this.rows={};this.people={};this.events=[];this.view=new URLSearchParams(location.search).get('view')||'new';if(!['live','new','mine','progress','waiting','finished','rejected','all'].includes(this.view))this.view='new';this.query='';this.ready=false;this.timer=null;}
  async mount(events){
   this.events=events;
   try{
    const [work,people]=await Promise.all([this.db.from('far_event_workflow').select('*'),this.db.rpc('far_event_colleagues')]);
    if(work.error||people.error)throw work.error||people.error;
    this.rows=Object.fromEntries((work.data||[]).map(w=>[w.event_id,w]));this.people=Object.fromEntries((people.data||[]).map(p=>[p.user_id,p.display_name]));this.ready=true;
   }catch(error){this.ready=false;this.list.prepend(this.message('Shared workflow is unavailable. Editing is paused to avoid duplicate work. Refresh or contact Nathaniel.'));}
   this.toolbar();
   for(const event of events)this.card(event);
   this.applyFilters();
   if(this.timer)clearInterval(this.timer);
   this.timer=setInterval(()=>this.refresh(),20000);
  }
  message(text){const p=document.createElement('p');p.className='event-work-message';p.setAttribute('role','status');p.textContent=text;return p;}
  toolbar(){
   let bar=document.getElementById('eventWorkflowToolbar');
   if(!bar){bar=document.createElement('section');bar.id='eventWorkflowToolbar';bar.className='event-work-toolbar';this.list.before(bar);
    bar.innerHTML='<h2>Shared events desk</h2><p>Take an event before editing. Everyone sees the same owner and progress. Publication is a separate decision.</p><a href="events.html" target="_blank" rel="noopener">Open the actual public events page ↗</a><div role="tablist" aria-label="Event views"></div><label for="eventDeskSearch">Find an event</label><input id="eventDeskSearch" type="search" placeholder="Event, venue or town"><p class="event-work-count" role="status"></p>';
    for(const [key,label] of [['live','Live / Public'],['new','New'],['mine','My work'],['progress','In progress'],['waiting','Waiting'],['finished','Completed'],['rejected','Rejected'],['all','All events']]){
     const b=document.createElement('button');b.type='button';b.role='tab';b.dataset.view=key;b.dataset.label=label;b.onclick=()=>{this.view=key;const address=new URL(location.href);address.searchParams.set('view',key);history.replaceState(null,'',address);this.applyFilters();};bar.querySelector('[role="tablist"]').append(b);
    }
    bar.querySelector('input').oninput=e=>{this.query=e.target.value.toLocaleLowerCase('en-GB').trim();this.applyFilters();};
   }
  }
  applyFilters(){
   const bar=document.getElementById('eventWorkflowToolbar');if(!bar)return;
   let count=0;
   const upcoming=e=>window.FAREventMedia.upcoming(e);
   for(const b of bar.querySelectorAll('[data-view]')){const n=this.events.filter(e=>matches(b.dataset.view,e,this.rows[e.id],this.uid,upcoming)).length;b.textContent=b.dataset.label+' ('+n+')';b.setAttribute('aria-selected',String(b.dataset.view===this.view));}
   for(const event of this.events){const c=this.list.querySelector('[data-id="'+event.id+'"]');if(!c)continue;const visible=matches(this.view,event,this.rows[event.id],this.uid,upcoming)&&(!this.query||[event.title,event.venue,event.town].join(' ').toLocaleLowerCase('en-GB').includes(this.query));c.hidden=!visible;if(visible)count++;}
   bar.querySelector('.event-work-count').textContent=count+' event'+(count===1?'':'s')+' in this view. Changes by colleagues refresh automatically; unsaved event text is kept.';
  }
  card(event){
   const c=this.list.querySelector('[data-id="'+event.id+'"]');if(!c)return;
   const panel=document.createElement('section');panel.className='event-work-panel';
   panel.innerHTML='<h2>Who is handling this?</h2><p class="event-work-owner"></p><p class="event-work-progress"></p><p class="event-work-last"></p><div class="event-work-controls"></div><label for="work-note-'+escape(event.id)+'">Private team note</label><textarea id="work-note-'+escape(event.id)+'" maxlength="2000" placeholder="What needs doing, what is missing, or a handover note"></textarea><div class="event-work-history"></div>';
   const controls=panel.querySelector('.event-work-controls');
   for(const [action,label] of [['claim','Take this event'],['release','Release to team'],['waiting','Waiting for information'],['in_progress','Resume work'],['completed','Mark completed'],['note','Save note']]){
    const b=document.createElement('button');b.type='button';b.className='far-action secondary';b.dataset.workAction=action;b.textContent=label;b.onclick=()=>this.act(event,action,panel);controls.append(b);
   }
   if(['owner','deputy_manager'].includes((this.admin.role||'').toLowerCase())){
    const l=document.createElement('label');l.textContent='Assign or hand over to';const s=document.createElement('select');s.setAttribute('aria-label','Assign '+event.title);s.innerHTML='<option value="">Unassigned</option>'+Object.entries(this.people).map(([id,name])=>'<option value="'+escape(id)+'">'+escape(name)+'</option>').join('');l.append(s);controls.append(l);
    const b=document.createElement('button');b.type='button';b.className='far-action secondary';b.textContent='Assign / hand over';b.dataset.workAction='assign';b.onclick=()=>this.act(event,'assign',panel,s.value||null);controls.append(b);
   }
   const history=document.createElement('button');history.type='button';history.className='far-action secondary';history.dataset.workHistory='';history.textContent='Show action history';history.onclick=()=>this.history(event.id,panel);panel.append(history,this.message(''));
   c.prepend(panel);this.paint(event,c);
  }
  paint(event,c){
   const w=state(event,this.rows[event.id]),p=c.querySelector('.event-work-panel');if(!p)return;
   const mine=w.assigned_to===this.uid,owned=!!w.assigned_to;
   p.querySelector('.event-work-owner').textContent='Assigned to: '+(this.people[w.assigned_to]||(owned?'Another colleague':'Unassigned'));
   p.querySelector('.event-work-progress').textContent='Progress: '+labels[w.progress]+' · Publication: '+(event.status||'pending');
   p.querySelector('.event-work-last').textContent=w.updated_at?'Last action: '+(actions[w.last_action]||w.last_action||'Updated')+' · '+(this.people[w.updated_by]||'FAR colleague')+' · '+new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/London'}).format(new Date(w.updated_at)):'No staff action recorded in the shared desk yet.';
   for(const el of c.querySelectorAll('input,textarea,select,button')){
    if(p.contains(el))continue;
    if(!el.hasAttribute('data-work-original-disabled'))el.dataset.workOriginalDisabled=String(el.disabled);
    el.disabled=!this.ready||!mine||el.dataset.workOriginalDisabled==='true';
   }
   for(const b of p.querySelectorAll('[data-work-action]')){const a=b.dataset.workAction;b.disabled=!this.ready||(a==='claim'?owned&&!mine:a==='assign'?false:a==='release'?!owned:!mine);if(a==='claim')b.textContent=mine?'Assigned to you':'Take this event';}
   for(const a of c.querySelectorAll('a[href^="mailto:"]')){a.setAttribute('aria-disabled',String(!this.ready||!mine));a.onclick=e=>{if(!this.ready||!mine){e.preventDefault();p.querySelector('[role="status"]').textContent='Take this item before replying so the team knows who is handling it.';}};}
   p.querySelector('textarea').disabled=!this.ready||!mine;
   const s=p.querySelector('select');if(s)s.value=w.assigned_to||'';
  }
  async act(event,action,panel,target){
   const status=panel.querySelector('[role="status"]');const note=panel.querySelector('textarea').value.trim();
   if(action==='assign'&&this.rows[event.id]?.assigned_to&&this.rows[event.id].assigned_to!==target&&!confirm('Hand this event to another colleague? Their unsaved edits will no longer be accepted.'))return;
   for(const b of panel.querySelectorAll('button'))b.disabled=true;status.textContent='Saving shared workflow…';
   try{
    const w=this.rows[event.id];const {data,error}=await this.db.rpc('far_event_work_action',{p_event_id:event.id,p_action:action,p_version:w?w.version:null,p_note:note,p_assigned_to:target||null});
    if(error)throw error;this.rows[event.id]=Array.isArray(data)?data[0]:data;panel.querySelector('textarea').value='';status.textContent='Shared workflow saved.';if(action==='claim'){this.view='mine';const address=new URL(location.href);address.searchParams.set('view','mine');history.replaceState(null,'',address);}
   }catch(error){status.textContent=error.message||'Could not save. Refresh the workflow before trying again.';}
   finally{await this.refresh();panel.querySelector('[data-work-history]').disabled=false;}
  }
  async refresh(){
   if(!this.ready)return;
   const {data,error}=await this.db.from('far_event_workflow').select('*');
   if(error){this.ready=false;for(const e of this.events){const c=this.list.querySelector('[data-id="'+e.id+'"]');if(c)this.paint(e,c);}return;}
   this.rows=Object.fromEntries((data||[]).map(w=>[w.event_id,w]));for(const e of this.events){const c=this.list.querySelector('[data-id="'+e.id+'"]');if(c)this.paint(e,c);}this.applyFilters();
  }
  async history(id,panel){
   const out=panel.querySelector('.event-work-history');out.textContent='Loading history…';
   const {data,error}=await this.db.from('far_event_activity').select('actor_name,action,detail,created_at').eq('event_id',id).order('id',{ascending:false}).limit(30);
   if(error){out.textContent='Could not load history.';return;}
   out.replaceChildren();for(const row of data||[]){const p=document.createElement('p');p.textContent=new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/London'}).format(new Date(row.created_at))+' — '+row.actor_name+': '+(actions[row.action]||row.action)+(row.detail?' — '+row.detail:'');out.append(p);}if(!data?.length)out.textContent='No actions recorded yet. Older submissions were not audited by this desk.';
  }
  destroy(){if(this.timer)clearInterval(this.timer);this.ready=false;}
 }
 window.FAREventWorkflow={EventWorkflow,matches,state};
})();
