import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {PGlite} from '@electric-sql/pglite';
import {build} from 'esbuild';
const db=new PGlite();
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
grant usage on schema public,auth to anon,authenticated,service_role;
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create function auth.jwt() returns jsonb language sql as $$select jsonb_build_object('email',current_setting('request.jwt.claim.email',true))$$;
create table far_admins(user_id uuid,role text,permissions jsonb);
insert into far_admins values('00000000-0000-0000-0000-000000000001','owner','[]');`);
for(const file of ['202610150001_far_vouchers.sql','202610150003_voucher_safeguards.sql','202610150004_voucher_recovery.sql','202610150005_exchange_value.sql','202610150006_rounded_sale_price.sql'])await db.exec(await readFile(`supabase/migrations/${file}`,'utf8'));
const q=async(sql,args=[]) => (await db.query(sql,args)).rows;
const [{id:business}]=await q("insert into far_voucher_businesses(name,contact_email) values('Demo · Riverside Cafe','cafe@example.test') returning id");
await q('insert into far_voucher_members values($1,$2)',[business,'cafe@example.test']);
const [{id:offer}]=await q(`insert into far_voucher_offers(business_id,title,entitlement,terms,redemption_instructions,face_minor,sale_minor,agreed_quantity,expires_on,package_name,campaign_start,campaign_end,commitment,active) values($1,'Lunch for two','Two main meals and two soft drinks','One visit. Booking required. Excludes bank holidays.','Present this voucher when ordering.',3000,2000,12,current_date+90,'Website & social package',current_date-10,current_date+80,'90 days on the FAR website and four social posts.',true) returning id`,[business]);
await q("insert into far_voucher_documents(offer_id,business_id,kind,name,path) values($1,$2,'agreement','DEMO agreement.pdf',$3),($1,$2,'voucher_batch','DEMO voucher batch.pdf',$4)",[offer,business,`${business}/agreement.pdf`,`${business}/stock.pdf`]);
await q("select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false)");
await q('select far_voucher_import($1,$2,$3)',[offer,crypto.randomUUID(),JSON.stringify(Array(12).fill(''))]);
await q('update far_voucher_settings set sales_enabled=true');
const [{r:order}]=await q('select far_voucher_reserve($1,$2,$3) r',[offer,'buyer@example.test',crypto.randomUUID()]);
await q("update far_voucher_orders set checkout_id='DEMO-CHECKOUT' where id=$1",[order.id]);
await q("select far_voucher_settle($1,'DEMO-CHECKOUT',1500,'GBP','DEMO-TRANSACTION')",[order.id]);
await q('update far_voucher_settings set sales_enabled=false');
const [{code}]=await q('select code from far_voucher_stock where order_id=$1',[order.id]);
await mkdir('demo/dist',{recursive:true});
await build({entryPoints:['./src/voucher-app.js'],bundle:true,format:'esm',target:['es2022'],outfile:'demo/dist/voucher-app.js',alias:{'@supabase/supabase-js':resolve('demo/client.mjs')}});
let html=await readFile('src/voucher-app.html','utf8');
html=html.replace('<main id="app">','<div style="background:#ffbe83;color:#1b2829;padding:9px;text-align:center;font:12px Arial">LOCAL DEMO · Sample data only · No payments or accounting updates · <a style="color:#1b2829" href="?as=business">Business view</a> · <a style="color:#1b2829" href="?as=staff">Staff view</a></div><main id="app">');
await writeFile('demo/dist/voucher-app.html',html);
await writeFile('demo/dist/events-config.js',"window.FAR_EVENTS_CONFIG={SUPABASE_URL:location.origin,SUPABASE_ANON_KEY:'LOCAL-TEST-ONLY'};");
// PGlite uses one connection: serialise request identities so RLS tests stay isolated.
let queue=Promise.resolve();
const quote=name=>{if(!/^[a-z_]+$/.test(name))throw Error('Invalid identifier');return `"${name}"`;};
const tables=new Set(['businesses','offers','documents','stock','orders','jobs','members','settings'].map(n=>'far_voucher_'+n));
async function request(body){
 const role=body.role==='business'?'business':'staff';
 await db.exec('reset role');
 await q("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.email',$2,false)",[role==='staff'?'00000000-0000-0000-0000-000000000001':'00000000-0000-0000-0000-000000000002',role==='staff'?'owner@example.test':'cafe@example.test']);
 await db.exec('set role authenticated');
 if(body.name){
  const names={far_voucher_context:[],far_voucher_import:['p_offer','p_import','p_codes'],far_voucher_lookup:['p_code','p_redeem'],far_voucher_ticket:['p_token'],far_voucher_catalog:[]};
  if(!names[body.name])throw Error('Unsupported local RPC');
  const args=names[body.name].map(k=>k==='p_codes'?JSON.stringify(body.args[k]):body.args[k]);
  return (await q(`select ${body.name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args))[0].result;
 }
 if(!tables.has(body.table))throw Error('Unsupported table');
 const args=[],where=(body.filters||[]).map(([k,v])=>{args.push(v);return quote(k)+'=$'+args.length;}).join(' and ');
 let sql=`select * from ${body.table}`;
 if(body.op==='insert'||body.op==='upsert'){
  const entries=Object.entries(body.value);args.length=0;args.push(...entries.map(e=>e[1]));
  sql=`insert into ${body.table}(${entries.map(e=>quote(e[0])).join(',')}) values(${args.map((_,i)=>'$'+(i+1)).join(',')})${body.op==='upsert'?' on conflict do nothing':''} returning *`;
 }else if(body.op==='update'){
  const assignments=Object.entries(body.value).map(([k,v])=>{args.push(v);return quote(k)+'=$'+args.length;});
  sql=`update ${body.table} set ${assignments.join(',')}${where?' where '+where:''} returning *`;
 }else sql+=where?' where '+where:'';
 const rows=await q(sql,args);return body.single?rows[0]:rows;
}
const server=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://127.0.0.1:8774');
  if(req.method==='POST'){
   let raw='';for await(const part of req){raw+=part;if(raw.length>200000)throw Error('Request too large');}
   if(url.pathname==='/demo-api'){
    const result=queue.then(()=>request(JSON.parse(raw)));queue=result.catch(()=>{});
    try{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({data:await result,error:null}));}catch(e){res.end(JSON.stringify({data:null,error:{message:e.message}}));}return;
   }
   if(url.pathname==='/functions/v1/far-voucher-api'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({sumup:false,email:false,pandle:false,sales:false,error:url.searchParams.get('action')==='connections'?undefined:'Local demo: no external changes are made'}));return;}
  }
  const path=url.pathname==='/'?'voucher-app.html':url.pathname.slice(1);
  const files={'voucher-app.html':'demo/dist/voucher-app.html','voucher-app.js':'demo/dist/voucher-app.js','voucher-app.css':'src/voucher-app.css','events-config.js':'demo/dist/events-config.js'};
  if(!files[path]){res.writeHead(404);res.end('Not found');return;}
  res.setHeader('Content-Type',({'html':'text/html','js':'text/javascript','css':'text/css'})[extname(path).slice(1)]);res.setHeader('Cache-Control','no-store');res.end(await readFile(files[path]));
 }catch{res.writeHead(500);res.end('Local preview error');}
});
server.listen(8774,'127.0.0.1',()=>console.log(JSON.stringify({url:'http://127.0.0.1:8774/voucher-app.html',businessUrl:'http://127.0.0.1:8774/voucher-app.html?as=business',ticketUrl:`http://127.0.0.1:8774/voucher-app.html?ticket=${order.ticket_token}`,sampleCode:code})));
