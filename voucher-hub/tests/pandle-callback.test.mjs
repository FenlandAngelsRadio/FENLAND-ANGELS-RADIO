import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';

test('Pandle callback rejects invalid, expired, reused and no-longer-authorised connection states',async()=>{
 const source=await readFile(new URL('../supabase/functions/far-voucher-api/index.ts',import.meta.url),'utf8');
 const code=source.slice(source.indexOf('async function stateName('),source.indexOf('async function maintainPandle('))
  .replaceAll(':string','').replaceAll(':URL','').replaceAll(':any','');
 const rows=new Map();let role='owner',tokenCalls=0,deletes=0;
 const db={from(){return {mode:'',name:'',delete(){this.mode='delete';return this;},eq(column,value){if(column==='name')this.name=value;return this;},select(){if(this.mode==='delete'){deletes++;const value=rows.get(this.name);rows.delete(this.name);return Promise.resolve({data:value?[{value}]:[]});}return this;},maybeSingle(){return Promise.resolve({data:role?{role}:null});}};}};
 const context=vm.createContext({crypto:webcrypto,TextEncoder,Date,URL,Response,Number,db,check:r=>r.data,env:()=>'',appUrl:'https://fenlandangelsradio.co.uk/voucher-app.html',pandleOAuthToken:async()=>{tokenCalls++;throw Error('Unexpected token request');}});
 vm.runInContext(code,context);
 const callback=state=>new URL('https://far.example/callback?code=example&state='+state);
 const outcome=r=>new URL(r.headers.get('Location')).searchParams.get('pandle_connection');
 assert.equal(outcome(await context.pandleCallback(callback('wrong'))),'failed');assert.equal(deletes,0);
 const state='a'.repeat(64),key=await context.stateName(state);
 assert.ok(!key.includes(state));
 rows.set(key,{owner_id:'owner',expires_at:Date.now()-1});
 assert.equal(outcome(await context.pandleCallback(callback(state))),'expired');
 rows.set(key,{owner_id:'owner',expires_at:Date.now()+100000});role=null;
 assert.equal(outcome(await context.pandleCallback(callback(state))),'failed');
 role='owner';rows.set(key,{owner_id:'owner',expires_at:Date.now()+100000});
 assert.equal(outcome(await context.pandleCallback(callback(state))),'unavailable');
 assert.equal(outcome(await context.pandleCallback(callback(state))),'expired');
 assert.equal(tokenCalls,0);
});
