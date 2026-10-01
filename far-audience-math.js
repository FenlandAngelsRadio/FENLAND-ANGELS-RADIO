/* Pure reporting calculations. Connections/devices are not individual people. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.FARAudienceMath=api;})(typeof window==='object'?window:globalThis,()=>{
  const STEP=300000;
  const time=v=>new Date(v).getTime();
  function london(ts){const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(ts));return Object.fromEntries(parts.map(p=>[p.type,p.value]));}
  function rangeStart(range,now){
    if(range==='all')return time('2026-09-29T00:00:00+01:00');
    const p=london(now),date=Date.UTC(+p.year,+p.month-1,+p.day);
    if(range!=='today')return now-Number(range)*86400000;
    let candidate=date;
    for(let i=0;i<3;i++){const c=london(candidate),represented=Date.UTC(+c.year,+c.month-1,+c.day,+c.hour,+c.minute);candidate+=date-represented;}
    return candidate;
  }
  async function readAll(build){
    const rows=[];
    for(let offset=0;offset<500000;){
      const {data,error}=await build().range(offset,offset+499);
      if(error)throw error;
      if(!Array.isArray(data))throw new Error('Audience history returned an invalid page.');
      if(!data.length)return rows;
      rows.push(...data);offset+=data.length; // Do not assume the server honours our requested page size.
    }
    throw new Error('Audience history is too large to load completely. No partial total is shown.');
  }
  function sessions(rows,from,until){
    const map=new Map();
    for(const r of rows){
      if(!r.listen_session_id||!String(r.event_type).startsWith('listen_'))continue;
      const at=time(r.created_at);if(!Number.isFinite(at)||at>until)continue;
      const seconds=Math.max(0,Number(r.duration_seconds)||0),start=at-seconds*1000;
      let s=map.get(r.listen_session_id);
      if(!s){s={id:r.listen_session_id,source:r.source,device:r.device_id,start,seconds:0,latest:r};map.set(s.id,s);}
      s.start=Math.min(s.start,start);
      s.seconds=Math.max(s.seconds,seconds);
      if(at>time(s.latest.created_at)||(at===time(s.latest.created_at)&&r.event_type==='listen_stop'))s.latest=r;
    }
    return [...map.values()].map(s=>({...s,seconds:Math.max(0,(Math.min(until,s.start+s.seconds*1000)-Math.max(from,s.start))/1000)})).filter(s=>s.seconds>0||time(s.latest.created_at)>=from);
  }
  function intervals(rows,from,until){
    const ordered=[...rows].filter(r=>Number.isFinite(time(r.created_at))).sort((a,b)=>time(a.created_at)-time(b.created_at));
    const result=[];
    for(let i=0;i<ordered.length;i++){
      const r=ordered[i],start=Math.max(from,time(r.created_at)),end=Math.min(until,time(r.created_at)+STEP,i+1<ordered.length?time(ordered[i+1].created_at):until);
      if(end<=start||r.stream_online===false||!Number.isFinite(Number(r.listeners)))continue;
      result.push({start,end,listeners:Math.max(0,Number(r.listeners)),row:r});
    }
    return result;
  }
  function summary(items){const ms=items.reduce((n,r)=>n+r.end-r.start,0),hours=items.reduce((n,r)=>n+r.listeners*(r.end-r.start)/3600000,0);return{hours,coverageHours:ms/3600000,average:ms?hours*3600000/ms:null,peak:items.length?Math.max(...items.map(r=>r.listeners)):null,samples:items.length};}
  function parts(items){const result=[];for(const r of items){for(let start=r.start;start<r.end;){const end=Math.min(r.end,(Math.floor(start/60000)+1)*60000);result.push({...r,start,end,local:london(start)});start=end;}}return result;}
  function programme(items,show){const minutes=v=>{const p=String(v).split(':');return +p[0]*60+ +p[1];},a=minutes(show.start_time),z=minutes(show.end_time);
    const dayOK=d=>show.day_group==='weekday'?['Mon','Tue','Wed','Thu','Fri'].includes(d):show.day_group==='saturday'?d==='Sat':show.day_group==='sunday'?d==='Sun':false;
    return items.filter(r=>{const m=+r.local.hour*60+ +r.local.minute;if(z>a)return dayOK(r.local.weekday)&&m>=a&&m<z;
      if(m>=a)return dayOK(r.local.weekday);const previous=london(r.start-86400000).weekday;return m<z&&dayOK(previous);});
  }
  return{london,rangeStart,readAll,sessions,intervals,summary,parts,programme};
});
