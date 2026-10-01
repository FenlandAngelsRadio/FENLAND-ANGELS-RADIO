const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {stripTypeScriptTypes}=require('node:module');
const root=require('node:path').resolve(__dirname,'..');
new vm.Script(fs.readFileSync(root+'/far-call-centre.js','utf8'));
async function run({role='staff',permissions=[],login=true,bridge=true,action='list',bridgeStatus=200,claimedRole,ssh=false}={}){
 let handler, forwarded, count=0;
 const text=fs.readFileSync(root+'/supabase/functions/far-call-centre/index.ts','utf8').replace(/^import[^\n]*\n/gm,'');
 vm.runInNewContext(stripTypeScriptTypes(text),{
  sshConfigured:()=>ssh,serverBridge:async(service,method,path,payload)=>{forwarded=payload;return {status:bridgeStatus,data:{calls:[{id:'show',category:'show'},{id:'private',category:'business'}],version:1,audio_ready:false,private_access:true}}},
    createClient:()=>count++?{from:()=>({select(){return this},eq(){return this},async maybeSingle(){return{data:{role,permissions},error:null}}})}:{auth:{async getUser(){return{data:{user:login?{id:'real-user'}:null},error:null}}}},
  Deno:{serve:f=>handler=f,env:{get:k=>k==='FAR_CALL_CENTRE_URL'?(bridge?'https://private.example.test':undefined):k==='FAR_CALL_STAFF_TOKEN'?'server-only-test-token':'config'}},
  fetch:async(url,options)=>{forwarded=JSON.parse(options.body);return new Response(JSON.stringify(bridgeStatus===200?{calls:[{id:'show',category:'show'},{id:'private',category:'business'}],version:1,audio_ready:false,private_access:true}:{error:'Another team member changed the queue.'}),{status:bridgeStatus});},
  Request,Response,URL,AbortSignal
 });
 const response=await handler(new Request('https://far.test/functions/v1/far-call-centre',{method:'POST',headers:{Authorization:'Bearer test'},body:JSON.stringify({action,actor:{role:claimedRole||'owner'},id:'call',operation:'screen',version:1})}));
 return{status:response.status,body:await response.json(),forwarded};
}
(async()=>{
 let r=await run();assert.equal(r.status,403);assert.equal(r.forwarded,undefined);
 r=await run({login:false});assert.equal(r.status,401);
 r=await run({permissions:['cloud_live']});assert.equal(r.status,200);assert.equal(r.body.calls.length,1);assert.equal(r.body.private_access,false);assert.equal(r.forwarded.actor.role,'staff');assert.equal(r.forwarded.actor.id,'real-user');
 for(const role of ['owner','deputy_manager']){r=await run({role});assert.equal(r.status,200);assert.equal(r.body.calls.length,2);}
 r=await run({role:'owner',bridge:false});assert.equal(r.status,503);assert.equal(r.forwarded,undefined);
 r=await run({role:'owner',action:'arrive'});assert.equal(r.status,400);assert.equal(r.forwarded,undefined);
 r=await run({role:'owner',action:'act',bridgeStatus:409});assert.equal(r.status,409);assert.match(r.body.error,/Another team/);
 r=await run({permissions:['cloud_live'],ssh:true,bridge:false});assert.equal(r.status,200);assert.equal(r.body.calls.length,1);assert.equal(r.forwarded.actor.id,'real-user');
 r=await run({ssh:true,claimedRole:'owner'});assert.equal(r.status,403);assert.equal(r.forwarded,undefined);
 console.log('Passed: call-centre login, staff/management access, private-call filtering, client role spoof rejection, missing bridge, restricted provider events and conflict handling. Service calls mocked.');
})().catch(e=>{console.error(e);process.exitCode=1});
