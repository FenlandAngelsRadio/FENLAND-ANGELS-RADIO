import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pandleMapping,pandleSession} from '../supabase/functions/far-voucher-api/integrations.mjs';
const fixture={companies:[{id:'123178',attributes:{'company-name':'Bastone Major Group Ltd','vat-registered':false}}],banks:[{id:'367099',attributes:{name:'FAR - SumUp Payment Clearing'}}],categories:[{id:'11',attributes:{'nominal-code':'420',name:'FAR - Voucher Sales',inactive:false}},{id:'12',attributes:{'nominal-code':'505',name:'FAR - SumUp Processing Fees',inactive:false}}],taxes:[{id:'13',attributes:{taxcode:'NV','tax-rate':'0.00'}}],currencies:[{id:'14',attributes:{'currency-code':'GBP'}}]};
test('Pandle mapping requires the exact legal company and FAR accounts',()=>{
 assert.deepEqual(pandleMapping(fixture),{company:123178,bank:367099,sales:11,fees:12,noVat:13,gbp:14});
 assert.throws(()=>pandleMapping({...fixture,categories:fixture.categories.slice(0,1)}));
 assert.throws(()=>pandleMapping({...fixture,taxes:[{id:'13',attributes:{taxcode:'NV','tax-rate':'20'}}]}));
 assert.throws(()=>pandleMapping({...fixture,companies:[{...fixture.companies[0],attributes:{...fixture.companies[0].attributes,'vat-registered':true}}]}));
});
test('Pandle sign-in returns only session headers, not the password or profile',async()=>{
 let destination,body;
 const fake=async(url,init)=>{destination=url;body=JSON.parse(init.body);return new Response('{"profile":"private"}',{status:201,headers:{'access-token':'TEST-TOKEN',client:'TEST-CLIENT',uid:'TEST-UID'}});};
 const result=await pandleSession('test@example.test','TEST-PASSWORD',fake);
 assert.equal(destination,'https://my.pandle.com/api/v1/auth/sign_in');assert.equal(body.password,'TEST-PASSWORD');
 assert.deepEqual(result,{'access-token':'TEST-TOKEN',client:'TEST-CLIENT',uid:'TEST-UID'});
 assert.ok(!JSON.stringify(result).includes('TEST-PASSWORD'));
 await assert.rejects(pandleSession('test@example.test','TEST-PASSWORD',async()=>new Response('{}',{status:401})),/not accepted/);
});
