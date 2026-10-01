const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const context={window:{},crypto:require('node:crypto').webcrypto};
vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../admin-media.js'),'utf8'),context);
const media=context.window.FARMedia;
(async()=>{
  let calls=0;
  const db={storage:{from:name=>{assert.equal(name,'far-cms-media');return {
    upload:async(path,file,options)=>{calls++;assert.match(path,/^pages\/[\w-]+\.png$/);assert.equal(options.upsert,false);return {error:null};},
    getPublicUrl:path=>({data:{publicUrl:'https://far.test/'+path}})
  };}}};
  await assert.rejects(media.upload(db,{type:'application/pdf',size:50},'pages'),/JPG/);
  await assert.rejects(media.upload(db,{type:'image/png',size:10485761},'pages'),/10 MB/);
  await assert.rejects(media.upload(db,{type:'image/png',size:0},'pages'),/empty/);
  assert.equal(calls,0,'Invalid files must never be sent');
  assert.match(await media.upload(db,{type:'image/png',size:500},'pages'),/^https:\/\/far.test\/pages\//);
  const denied={storage:{from:()=>({upload:async()=>({error:{message:'row-level policy violated'}})})}};
  await assert.rejects(media.upload(denied,{type:'image/jpeg',size:500},'team'),/station owner/);
  const offline={storage:{from:()=>({upload:async()=>{throw new Error('Failed to fetch')}})}};
  await assert.rejects(media.upload(offline,{type:'image/jpeg',size:500},'team'));
  console.log('Passed: image validation, no invalid uploads, safe file names, existing bucket, successful URL, denied/offline uploads.');
})().catch(e=>{console.error(e);process.exitCode=1;});
