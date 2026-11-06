(function(){
 const cfg=window.FAR_EVENTS_CONFIG||{};if(!window.supabase||!cfg.SUPABASE_URL||!cfg.SUPABASE_ANON_KEY)return;
 const db=supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY);
 const mins=t=>{const [h,m]=String(t).slice(0,5).split(':').map(Number);return h*60+m;};
 const covers=(r,m)=>{const a=mins(r.start_time),b=mins(r.end_time);return b>a?m>=a&&m<b:m>=a||m<b;};
 const fmt=m=>String(Math.floor(m/60)%24).padStart(2,'0')+':'+String(m%60).padStart(2,'0')+':00';

 const londonDate=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 function remembranceSunday(rows,group){
  const date=londonDate();
  if(group!=='sunday'||date<'2026-11-06'||date>'2026-11-08')return rows;
  const special={id:'remembrance-2026-11-08',day_group:'sunday',start_time:'10:00:00',end_time:'12:00:00',show_name:'Remembrance Sunday',presenter:null,strapline:'Sunday 8 November 2026 only',description:'Together, we remember. Join Fenland Angels Radio for a morning of reflection, including our Remembrance tribute and the two-minute silence at 11am. Casey Redmond’s complete Sixties show airs beforehand at 9am.',image:'assets/remembrance-sunday-2026.jpg',featured:true,active:true};
  const result=[];
  for(const row of rows){
   if(row.day_group!=='sunday'){result.push(row);continue;}
   const a=mins(row.start_time),b=mins(row.end_time);
   if(b<=a||b<=600||a>=720){result.push(row);continue;}
   if(a<600)result.push({...row,end_time:'10:00:00'});
   if(b>720)result.push({...row,start_time:'12:00:00'});
  }
  return [...result,special];
 }

 function forDay(rows,group){rows=remembranceSunday(rows,group);const specific=['monday','tuesday','wednesday','thursday','friday'].includes(group);const base=rows.filter(r=>r.day_group===(specific?'weekday':group));if(!specific)return base.slice().sort((a,b)=>mins(a.start_time)-mins(b.start_time));const overrides=rows.filter(r=>r.day_group===group);if(!overrides.length)return base.slice().sort((a,b)=>mins(a.start_time)-mins(b.start_time));const slots=[];let last=null;for(let m=0;m<1440;m++){const row=overrides.find(r=>covers(r,m))||base.find(r=>covers(r,m));if(!row){last=null;continue;}if(last&&last.original===row){last.end_time=fmt(m+1);continue;}last={...row,start_time:fmt(m),end_time:fmt(m+1),original:row};slots.push(last);}return slots.map(({original,...row})=>row);}
 window.FARCMS={forDay,async schedule(){const {data,error}=await db.from('far_schedule').select('*').eq('active',true).order('sort_order');if(error)throw error;return data||[];},current(rows){const p=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date()),day=p.find(x=>x.type==='weekday').value,now=Number(p.find(x=>x.type==='hour').value)*60+Number(p.find(x=>x.type==='minute').value),group=({Mon:'monday',Tue:'tuesday',Wed:'wednesday',Thu:'thursday',Fri:'friday',Sat:'saturday',Sun:'sunday'})[day];return forDay(rows,group).find(r=>covers(r,now))||null;}};
})();