const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
const math=require('../far-audience-math.js');
const source=stripTypeScriptTypes(fs.readFileSync('supabase/functions/far-audience/index.ts','utf8').replace(/^import[^\n]+\n/,''));
async function run(rows,cap,fail=false){
 let handler,calls=0;
 const db={from(){let lo=0,hi=0;const q={select(){return q},gte(){return q},lte(){return q},order(){return q},range(a,b){lo=a;hi=b;return q},then(resolve){calls++;resolve(fail?{error:new Error('offline')}:{data:rows.slice(lo,Math.min(hi+1,lo+cap))});}};return q;}};
 vm.runInNewContext(source,{createClient:()=>db,Deno:{env:{get:()=>''},serve:f=>handler=f},Response,Date,Number,Array,Set,Error,Math,JSON});
 const res=await handler({method:'GET'});return {status:res.status,body:await res.json(),calls};
}
(async()=>{
 const from=Date.parse('2026-09-29T22:18:59.24036Z');
 const rows=Array.from({length:1201},(_,i)=>({id:i+1,created_at:new Date(from+i*300000).toISOString(),listeners:i%4,stream_online:i%19!==0}));
 for(const cap of [500,100]){const r=await run(rows,cap);assert.equal(r.status,200);assert.equal(r.body.samples,rows.length);const expected=math.summary(math.intervals(rows,from,Date.parse(r.body.updated_at))).hours;assert.ok(Math.abs(r.body.added_hours-expected)<1e-9);assert.ok(r.calls>2);}
 const empty=await run([],500);assert.equal(empty.body.lifetime_hours,300.62);
 const bad=await run(rows,500,true);assert.equal(bad.status,500);assert.equal(bad.body.lifetime_hours,undefined);
 console.log('Passed: history beyond 1,000 rows, server page caps, offline samples, shared interval calculation, empty history and no partial totals on failure.');
})();