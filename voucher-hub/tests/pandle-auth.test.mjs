import test from 'node:test';
import assert from 'node:assert/strict';
import {pandleOAuthToken,pandleConnection} from '../supabase/functions/far-voucher-api/integrations.mjs';

test('Pandle OAuth exchange uses a form body and keeps only required credentials',async()=>{
 let request;
 const auth=await pandleOAuthToken({client_id:'app',client_secret:'PRIVATE',grant_type:'authorization_code',code:'CODE',redirect_uri:'https://far.example/callback'},async(url,init)=>{request={url,init};return Response.json({access_token:'ACCESS',refresh_token:'REFRESH',token_type:'Bearer',expires_in:3600,unrelated_profile:'private'});});
 assert.equal(request.url,'https://my.pandle.com/oauth/token');
 assert.equal(request.init.method,'POST');assert.equal(new URLSearchParams(request.init.body).get('client_secret'),'PRIVATE');
 assert.equal(auth.kind,'oauth');assert.equal(auth.access_token,'ACCESS');assert.equal(auth.unrelated_profile,undefined);assert.ok(auth.expires_at>Date.now());
 await assert.rejects(()=>pandleOAuthToken({},async()=>new Response('SECRET_PROVIDER_BODY',{status:401})),/^Error: Pandle authorisation failed \(401\)$/);
});
test('expired OAuth access refreshes before a financial write, using the new token exactly once',async()=>{
 const calls=[],saved=[];
 const {request}=pandleConnection({kind:'oauth',access_token:'OLD',refresh_token:'REFRESH',expires_at:Date.now()-1000},{clientId:'app',clientSecret:'PRIVATE',save:async value=>saved.push(value),fetcher:async(url,init)=>{calls.push({url,init});return url.endsWith('/oauth/token')?Response.json({access_token:'NEW',token_type:'bearer',expires_in:3600}):Response.json({data:{id:'entry'}});}});
 await request('/companies/123178/bank_accounts/367099/bank_transactions',{method:'POST',body:'{}'});
 assert.equal(calls.length,2);assert.ok(calls[0].url.endsWith('/oauth/token'));assert.equal(calls[1].init.headers.Authorization,'Bearer NEW');assert.equal(saved[0].refresh_token,'REFRESH');
});
test('a rejected write is never automatically retried; a rejected read can refresh once',async()=>{
 let posts=0;
 const {request}=pandleConnection({kind:'oauth',access_token:'ACCESS',refresh_token:'REFRESH'},{clientId:'app',clientSecret:'PRIVATE',fetcher:async()=>{posts++;return new Response(null,{status:401});}});
 await assert.rejects(()=>request('/companies/123178/bank_accounts/367099/bank_transactions',{method:'POST',body:'{}'}),/401/);assert.equal(posts,1);
 let reads=0,refreshes=0;
 const read=pandleConnection({kind:'oauth',access_token:'OLD',refresh_token:'REFRESH'},{clientId:'app',clientSecret:'PRIVATE',fetcher:async url=>{if(url.endsWith('/oauth/token')){refreshes++;return Response.json({access_token:'NEW',token_type:'Bearer',expires_in:3600});}reads++;return reads===1?new Response(null,{status:401}):Response.json({data:[]});}});
 assert.deepEqual(await read.request('/companies'),{data:[]});assert.equal(reads,2);assert.equal(refreshes,1);
});
test('legacy Pandle sessions save rotated token and expiry headers',async()=>{
 let saved;
 const {request}=pandleConnection({'access-token':'OLD',client:'client',uid:'uid',expiry:'1'},{save:async value=>{saved=value;},fetcher:async()=>Response.json({data:[]},{headers:{'access-token':'NEW',expiry:'2000000000'}})});
 await request('/companies');assert.equal(saved['access-token'],'NEW');assert.equal(saved.expiry,'2000000000');
 await assert.rejects(()=>request('//other.example/path'),/Invalid Pandle API path/);
});
