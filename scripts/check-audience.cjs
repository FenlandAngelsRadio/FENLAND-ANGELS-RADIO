const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const M=require('../far-audience-math.js');
const at=s=>Date.parse(s),end=at('2026-10-01T12:00:00Z');
const rows=[
 {id:1,event_type:'website_visit',device_id:'visitor',created_at:'2026-10-01T09:00:00Z'},
 {id:2,event_type:'listen_start',device_id:'listener',listen_session_id:'a',source:'website',duration_seconds:0,created_at:'2026-09-30T22:00:00Z'},
 {id:3,event_type:'listen_heartbeat',device_id:'listener',listen_session_id:'a',source:'website',duration_seconds:7200,created_at:'2026-10-01T00:00:00Z'},
 {id:4,event_type:'listen_stop',device_id:'listener',listen_session_id:'a',source:'website',duration_seconds:3600,created_at:'2026-10-01T00:00:01Z'},
];
const today=M.sessions(rows,M.rangeStart('today',end),end),week=M.sessions(rows,M.rangeStart('7',end),end);
assert.equal(today.length,1);assert.equal(today[0].seconds,3600);assert.equal(week[0].seconds,7200);assert.ok(week[0].seconds>=today[0].seconds);
assert.equal(new Set(today.map(r=>r.device)).size,1);assert.ok(!today.some(r=>r.device==='visitor'));
assert.equal(M.rangeStart('today',at('2026-10-25T12:00:00Z')),at('2026-10-24T23:00:00Z'));
assert.equal(M.rangeStart('today',at('2026-03-29T12:00:00Z')),at('2026-03-29T00:00:00Z'));
const snapshots=[{id:1,created_at:'2026-10-01T07:58:00Z',listeners:2,stream_online:true},{id:2,created_at:'2026-10-01T08:02:00Z',listeners:4,stream_online:true},{id:3,created_at:'2026-10-01T10:00:00Z',listeners:0,stream_online:false}];
const intervals=M.intervals(snapshots,at('2026-10-01T07:00:00Z'),end),sum=M.summary(intervals);
assert.equal(sum.coverageHours,9/60);assert.ok(Math.abs(sum.hours-28/60)<1e-10);
const pieces=M.parts(intervals),hour8=pieces.filter(r=>+r.local.hour===8),hour9=pieces.filter(r=>+r.local.hour===9);
assert.ok(Math.abs(M.summary(hour8).hours-4/60)<1e-10);assert.ok(Math.abs(M.summary(hour9).hours-24/60)<1e-10);
const show=M.programme(pieces,{day_group:'weekday',start_time:'09:00',end_time:'09:03'});
assert.ok(Math.abs(M.summary(show).hours-8/60)<1e-10);
assert.equal(M.summary([]).average,null);assert.equal(M.summary([]).peak,null);
const html=fs.readFileSync(require('node:path').join(__dirname,'../admin-audience.html'),'utf8');
for(const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))if(match[1].trim())new vm.Script(match[1]);
assert.match(html,/FARAudienceMath\.readAll/);assert.ok(!html.includes('.limit(10000)'));assert.match(html,/intervals\(allIce,MILESTONE_SINCE,now\)/);
(async()=>{
 const data=Array.from({length:1503},(_,id)=>({id}));let requests=0;
 const complete=await M.readAll(()=>({async range(start,end){requests++;return{data:data.slice(start,Math.min(end+1,start+137)),error:null};}}));
 assert.equal(complete.length,1503);assert.ok(requests>10);assert.equal(complete[1502].id,1502);
 await assert.rejects(M.readAll(()=>({async range(){return{error:new Error('Denied')};}})),/Denied/);
 console.log('Passed: complete pagination despite server caps, overlapping ranges, midnight/DST, duration regression, listening-only devices, gap coverage, hourly/programme boundaries, missing-data labels and page syntax.');
})().catch(e=>{console.error(e);process.exitCode=1});
