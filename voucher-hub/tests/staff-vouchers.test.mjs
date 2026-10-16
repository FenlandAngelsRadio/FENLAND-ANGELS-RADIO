import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {transform} from 'esbuild';
import vm from 'node:vm';

test('management can assign Voucher Hub at invitation; staff cannot grant access',async()=>{
 const source=await readFile(new URL('../supabase/functions/far-staff-admin/index.ts',import.meta.url),'utf8');
 const {code}=await transform(source.replace(/^import[^\n]+\n/,''),{loader:'ts'});
 async function attempt(role,permissions){
  let handler,saved;
  const admin={auth:{admin:{listUsers:async()=>({data:{users:[{id:'existing-staff',email:'staff@example.com'}]}})}},from:()=>({select(){return this;},eq(){return this;},single:async()=>({data:{role}}),maybeSingle:async()=>({data:{role:'presenter'}}),upsert:async value=>{saved=value;return {error:null};}})};
  const createClient=(_url,_key,options)=>options?{auth:{getUser:async()=>({data:{user:{id:'manager'}}})}}:admin;
  vm.runInNewContext(code,{createClient,Response,Error,Deno:{env:{get:()=> 'TEST-ONLY'},serve:fn=>{handler=fn;}}});
  const response=await handler(new Request('https://far.example/functions',{method:'POST',headers:{Authorization:'Bearer TEST-ONLY','Content-Type':'application/json'},body:JSON.stringify({action:'invite',email:'staff@example.com',display_name:'Existing staff',role:'staff',permissions})}));
  return {response,body:await response.json(),saved};
 }
 const success=await attempt('owner',['vouchers']);assert.equal(success.response.status,200);assert.ok(success.saved.permissions.includes('vouchers'));assert.ok(success.saved.permissions.includes('audience'));assert.equal(success.body.invited,false);
 const blocked=await attempt('presenter',['vouchers']);assert.equal(blocked.response.status,400);assert.match(blocked.body.error,/Management access required/);assert.equal(blocked.saved,undefined);
 const invalid=await attempt('owner',['invented_admin_permission']);assert.equal(invalid.response.status,400);assert.match(invalid.body.error,/Invalid permission/);assert.equal(invalid.saved,undefined);
});
