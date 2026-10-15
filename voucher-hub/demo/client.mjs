// Local QA adapter. Never included in the production bundle.
const role=new URLSearchParams(location.search).get('as')||'staff';
const call=async body=>{try{return await (await fetch('/demo-api',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,role})})).json();}catch{return {error:{message:'Local test connection failed'}};}};
export function createClient(){return {
 auth:{getSession:async()=>({data:{session:role==='signedout'?null:{access_token:'LOCAL-TEST-ONLY',user:{email:'test@example.test'}}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signInWithOtp:async()=>({data:{},error:null}),signOut:async()=>({error:null})},
 rpc:(name,args={})=>call({name,args}),
 from(table){const query={table,op:'select',filters:[]};const chain={select(){query.returning=true;return chain;},insert(value){query.op='insert';query.value=value;return chain;},update(value){query.op='update';query.value=value;return chain;},upsert(value){query.op='upsert';query.value=value;return chain;},eq(key,value){query.filters.push([key,value]);return chain;},single(){query.single=true;return chain;},then(resolve,reject){return call(query).then(resolve,reject);}};return chain;},
 storage:{from(){return {upload:async()=>({error:{message:'File storage requires the live secure backend. Local QA does not upload files.'}}),createSignedUrl:async()=>({error:{message:'Local test files are not downloadable'}})};}}
};}
