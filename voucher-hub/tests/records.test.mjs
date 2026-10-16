import test from 'node:test';
import assert from 'node:assert/strict';
import {readAllRows} from '../src/records.mjs';
test('stock and register reads continue beyond the provider page limit',async()=>{
 const data=Array.from({length:1205},(_,id)=>({id})),ranges=[];
 const client={from:()=>({select(){return this;},order(){return this;},range(from,to){ranges.push([from,to]);return Promise.resolve({data:data.slice(from,Math.min(to+1,from+500)),count:data.length});}})};
 const rows=await readAllRows(client,'far_voucher_stock');assert.equal(rows.length,1205);assert.equal(rows.at(-1).id,1204);assert.equal(ranges.length,3);assert.equal(ranges[1][0],500);
});
test('member pagination uses its composite key and refuses to hide a failed page',async()=>{
 const orders=[];const client={from:()=>({select(){return this;},order(name){orders.push(name);return this;},range(){return Promise.resolve({data:null,error:{message:'Connection lost'}});}})};
 await assert.rejects(()=>readAllRows(client,'far_voucher_members'),/Connection lost/);assert.deepEqual(orders,['business_id','email']);
});
