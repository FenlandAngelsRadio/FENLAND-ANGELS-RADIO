import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

test('offline checks are cleared and a failed redemption can be checked again',async()=>{
 const source=await readFile(new URL('../src/voucher-app.js',import.meta.url),'utf8');
 const fn=source.slice(source.indexOf('function showResult('),source.indexOf('async function ticket('));
 let confirmHandler,html='',cleared=false;
 const result={set innerHTML(value){html=value;},replaceChildren(){html='';cleared=true;}};
 const button={disabled:false,isConnected:true,addEventListener(_event,handler){confirmHandler=handler;}};
 const navigator={onLine:true};const messages=[];
 const context=vm.createContext({navigator,$:selector=>selector==='#voucher-result'?result:button,esc:String,day:String,toast:message=>messages.push(message),rpc:async()=>{throw Error('Network unavailable');}});
 vm.runInContext(fn,context);
 context.showResult({result:'valid',code:'FAR-TEST',message:'Check',title:'Test',entitlement:'Test',terms:'Test',expires_on:'2027-01-01'});
 assert.match(html,/Confirm redemption/);
 const event={currentTarget:button};const pending=confirmHandler(event);
 event.currentTarget=null; // DOM clears currentTarget once event dispatch returns.
 await pending;
 assert.equal(button.disabled,false);
 assert.match(messages.at(-1),/Check the voucher again/);
 navigator.onLine=false;
 context.showResult({result:'valid'});
 assert.equal(cleared,true);assert.equal(html,'');
 assert.match(messages.at(-1),/Reconnect/);
});
