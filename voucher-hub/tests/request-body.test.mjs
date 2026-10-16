import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {transform} from 'esbuild';
import vm from 'node:vm';

test('request parsing limits actual bytes and never echoes malformed credential input',async()=>{
 const source=await readFile(new URL('../supabase/functions/far-voucher-api/index.ts',import.meta.url),'utf8');
 const fn=source.slice(source.indexOf('async function readInput('),source.indexOf('async function rateKey('));
 const {code}=await transform(fn,{loader:'ts'});const context=vm.createContext({TextEncoder});vm.runInContext(code,context);
 const request=body=>new Request('https://far.example',{method:'POST',body});
 assert.equal((await context.readInput(request('{"email":"buyer@example.com"}'))).email,'buyer@example.com');
 await assert.rejects(()=>context.readInput(request('{"password":"VERY_PRIVATE",')),/^Error: Send a valid JSON request$/);
 await assert.rejects(()=>context.readInput(request('[]')),/Send a JSON object/);
 await assert.rejects(()=>context.readInput(request(JSON.stringify({text:'£'.repeat(10000)}))),/request is too large/);
});
