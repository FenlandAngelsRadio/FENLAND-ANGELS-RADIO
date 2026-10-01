const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {stripTypeScriptTypes}=require('node:module');
async function run(name,body,options={}) {
  let handler;const calls=[];
  const query=table=>({
    select(){return this},eq(){return this},order(){return this},
    async single(){calls.push('single:'+table);return {data:table==='far_admins'?{role:options.role||'owner'}:{id:'test-dj'}}},
    async maybeSingle(){return {data:{role:options.targetRole||'staff'}}},
    update(value){calls.push(['update',table,value]);return Promise.resolve({error:options.updateError?new Error('Update failed'):null})},
    async upsert(){calls.push('upsert');return {error:null}}
  });
  const admin={from:query,auth:{admin:{
    async listUsers(){return {data:{users:options.existing?[{id:'target',email:'staff@example.test'}]:[]}}},
    async inviteUserByEmail(){calls.push('invite');return {data:{user:{id:'target'}}}},
    async updateUserById(){calls.push('password');return {error:null}}
  }}};
  let clients=0;
  const source=fs.readFileSync(path.join(__dirname,'../supabase/functions',name,'index.ts'),'utf8').replace(/^import [^\r\n]*\r?\n/,'');
  vm.runInNewContext(stripTypeScriptTypes(source),{
    createClient:()=>clients++?admin:{auth:{async getUser(){return {data:{user:{id:'caller'}}}}}},
    Deno:{serve:f=>handler=f,env:{get:key=>key==='FAR_LIVE_ADMIN_URL'?(options.noBridge?undefined:'https://broadcast.example.test'):key==='FAR_LIVE_ADMIN_TOKEN'?(options.noBridge?undefined:'fake-token'):'fake-config'}},
    Response,crypto:require('node:crypto').webcrypto,
    fetch:async(url,init)=>{calls.push(['bridge',url,init.method]);return new Response('{}',{status:options.bridgeError?500:200})}
  });
  const response=await handler(new Request('https://function.example.test',{method:'POST',headers:{Authorization:'Bearer fake-test'},body:JSON.stringify(body)}));
  return {status:response.status,body:await response.json(),calls};
}
(async()=>{
  let r=await run('far-dj-admin',{action:'return_automation'});
  assert.equal(r.status,200);assert.equal(r.calls.some(x=>x==='single:far_djs'),false);assert.ok(r.calls.some(x=>Array.isArray(x)&&x[0]==='bridge'&&x[2]==='DELETE'));
  r=await run('far-dj-admin',{action:'return_automation'},{noBridge:true});assert.equal(r.status,400);assert.match(r.body.error,/not configured/);assert.equal(r.calls.some(x=>Array.isArray(x)&&x[0]==='update'),false);
  r=await run('far-dj-admin',{action:'return_automation'},{bridgeError:true});assert.equal(r.status,400);assert.equal(r.calls.some(x=>Array.isArray(x)&&x[0]==='update'),false);
  r=await run('far-dj-admin',{action:'return_automation'},{updateError:true});assert.equal(r.status,400);
  r=await run('far-dj-admin',{action:'list'},{role:'staff'});assert.equal(r.status,400);assert.match(r.body.error,/Management/);
  const invite={action:'invite',email:'staff@example.test',display_name:'Test staff',role:'staff',permissions:['audience']};
  r=await run('far-staff-admin',invite,{existing:true,targetRole:'owner'});assert.equal(r.status,400);assert.match(r.body.error,/Owner/);assert.equal(r.calls.includes('invite'),false);assert.equal(r.calls.includes('upsert'),false);
  r=await run('far-staff-admin',invite);assert.equal(r.status,200);assert.ok(r.calls.includes('invite'));assert.ok(r.calls.includes('upsert'));
  r=await run('far-staff-admin',invite,{role:'staff'});assert.equal(r.status,400);assert.equal(r.calls.includes('invite'),false);
  console.log('Passed: automation without DJ ID, missing/rejected bridge, failed saves, staff denial, Owner invitation protection and permitted invitation. All service calls mocked.');
})().catch(e=>{console.error(e);process.exitCode=1});
