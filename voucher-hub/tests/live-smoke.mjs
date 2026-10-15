// Read-only production checks and denied operations. Never creates orders or payments.
import assert from 'node:assert/strict';
const url='https://nkdjnrycpdiwburtkzen.supabase.co';
const anon='sb_publishable_jswOUS7A8Uw3RqQXj3kxQw_dZaJYC_2';
const post=async(path,body={},extra={})=>{
 const response=await fetch(url+path,{method:'POST',headers:{apikey:anon,'Content-Type':'application/json',Origin:'https://fenlandangelsradio.co.uk',...extra},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
 return {status:response.status,body:await response.json()};
};
const catalogue=await post('/rest/v1/rpc/far_voucher_catalog');
assert.equal(catalogue.status,200);assert.equal(catalogue.body.sales_open,false);assert.deepEqual(catalogue.body.offers,[]);
const lookup=await post('/rest/v1/rpc/far_voucher_lookup',{p_code:'NOT-A-VOUCHER',p_redeem:false});
assert.ok([401,403].includes(lookup.status));
const staff=await post('/functions/v1/far-voucher-api?action=connections');assert.equal(staff.status,401);
const worker=await post('/functions/v1/far-voucher-api?action=worker');assert.equal(worker.status,401);
console.log('PASS: live catalogue empty, sales off, anonymous redemption denied, staff API denied, worker denied.');
