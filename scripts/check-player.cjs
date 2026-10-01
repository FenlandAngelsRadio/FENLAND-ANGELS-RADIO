const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const source = file => fs.readFileSync(path.join(root, file), 'utf8');

async function check(file, audioId, buttonId, inline = false) {
  const handlers = new Map();
  function element(id) {
    return {id, textContent:'', style:{}, value:'0.8',
      addEventListener(type, fn) {handlers.set(id+':'+type, fn);}};
  }
  const elements = new Map();
  const get = id => {if (!elements.has(id)) elements.set(id, element(id)); return elements.get(id);};
  const audio = get(audioId);
  Object.assign(audio, {paused:true, currentTime:1800, error:null, volume:0.8,
    load() {this.currentTime=0; this.paused=true;},
    async play() {this.paused=false; handlers.get(audioId+':playing')?.();},
    pause() {this.paused=true; handlers.get(audioId+':pause')?.();}});
  const context = {document:{getElementById:get,querySelectorAll:()=>[],
    addEventListener(type, fn) {if(type==='DOMContentLoaded') fn();}},
    window:{addEventListener(){},matchMedia:()=>({matches:false}),navigator:{}},
    navigator:{}, setInterval(){}, location:{}, URL, console};
  let code = source(file);
  if (inline) code = [...code.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
    .map(m=>m[1]).filter(s=>s.includes("const audio=document.getElementById('radio')"))[0];
  vm.runInNewContext(code, context, {filename:file});
  const click = handlers.get(buttonId+':click');
  assert.ok(click, file+' exposes a Play button');
  await click();
  assert.equal(audio.paused, false, file+' starts playback');
  assert.equal(audio.currentTime, 0, file+' discards stale buffered audio');
  await click();
  assert.equal(audio.paused, true, file+' pauses playback');
  audio.currentTime = 1800;
  await click();
  assert.equal(audio.currentTime, 0, file+' resumes at live connection, not old audio');
  audio.pause();
  audio.play = async () => {throw new Error('offline');};
  await click();
  assert.equal(audio.paused,true,file+' handles a failed connection');
}

(async () => {
  await check('app.js','radioStream','mainPlay');
  await check('app/app.js','radio','play');
  await check('player.html','radio','play',true);
  const app = source('app/index.html');
  const worker = source('app/service-worker.js');
  const script = app.match(/src="(\.\/app\.js\?v=\d+)"/)[1];
  assert.ok(worker.includes("'"+script+"'"),'App cache includes the currently referenced script');
  assert.ok(worker.includes("'./index.html'"),'Offline fallback exists in the install cache');
  console.log('Live player checks passed: fresh connection, pause/resume, failed connection and app cache.');
})().catch(err=>{console.error(err);process.exitCode=1;});
