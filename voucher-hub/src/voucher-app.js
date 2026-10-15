import {agreementDraft} from './agreement.mjs';
import {advertisingCredit,customerPrice} from './exchange.mjs';
import {createClient} from '@supabase/supabase-js';
import QRCode from 'qrcode';
import jsQR from 'jsqr';

const $=s=>document.querySelector(s);
const root=$('#app');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format((n||0)/100);
const day=d=>d?new Date(`${String(d).slice(0,10)}T12:00:00Z`).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}):'Not set';
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const params=new URLSearchParams(location.search);
const publicConfig=window.FAR_EVENTS_CONFIG||{};
const config={supabaseUrl:publicConfig.SUPABASE_URL,supabaseAnonKey:publicConfig.SUPABASE_ANON_KEY};
let client,session,context,data={},activeTab='overview',stream,scanTimer;
const toast=(message,error=false)=>{const el=$('#notice');el.textContent=message;el.className=error?'error':'';el.style.display='block';clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.style.display='none',6500);};
const check=result=>{if(result.error)throw Error(result.error.message);return result.data;};
const rpc=async(name,args={})=>check(await client.rpc(name,args));
const api=async(action,body={})=>{
 const {data:{session:s}}=await client.auth.getSession();
 const response=await fetch(`${config.supabaseUrl}/functions/v1/far-voucher-api?action=${action}`,{method:'POST',headers:{'Content-Type':'application/json',apikey:config.supabaseAnonKey,...(s?{Authorization:`Bearer ${s.access_token}`}:{})},body:JSON.stringify(body)});
 const value=await response.json();if(!response.ok||value.error)throw Error(value.error||'Connection unavailable');return value;
};
function bindForm(id,fn){$(id)?.addEventListener('submit',async event=>{event.preventDefault();const form=event.currentTarget;const button=form.querySelector('button[type=submit]')||form.querySelector('button');button.disabled=true;try{await fn(new FormData(form),form);}catch(e){toast(e.message,true);}finally{if(button.isConnected)button.disabled=false;}});}
function heading(title,subtitle,badge=''){return `<div class="intro"><div><p class="eyebrow">FAR VOUCHER HUB</p><h1>${title}</h1><p>${subtitle}</p></div>${badge}</div>`;}
const empty=(title,detail)=>`<div class="empty"><strong>${title}</strong>${detail}</div>`;
const businessName=id=>data.businesses?.find(b=>b.id===id)?.name||'Business';
const offerTitle=id=>data.offers?.find(o=>o.id===id)?.title||'Offer';
const statusPill=(text,warn=false)=>`<span class="pill${warn?' warn':''}">${esc(text)}</span>`;

function login(){
 root.innerHTML=`<section class="panel login"><p class="eyebrow">WELCOME TO FAR</p><h1>One place for your vouchers.</h1><p>Staff manage agreements, stock and advertising. Businesses check and redeem their own vouchers.</p><form id="login"><label for="email">Your work email</label><input id="email" name="email" type="email" autocomplete="email" required placeholder="you@yourbusiness.co.uk"><button type="submit">Email me a sign-in link</button></form><p id="login-message" class="muted" role="status"></p><small>Use the email address FAR has approved for your business.</small></section><div class="link-row"><a href="admin-dashboard.html">FAR staff sign-in</a><a href="?shop=1">Browse vouchers</a><a href="vouchers.html">Back to FAR</a></div>`;
 bindForm('#login',async fd=>{
  const redirect=new URL(location.pathname,location.origin);if(params.get('voucher'))redirect.searchParams.set('voucher',params.get('voucher'));
  check(await client.auth.signInWithOtp({email:String(fd.get('email')).trim().toLowerCase(),options:{shouldCreateUser:false,emailRedirectTo:redirect.href}}));
  $('#login-message').textContent='If this email has access, a sign-in link is on its way. Check your inbox and spam folder.';
 });
}
async function loadData(){
 const tables=['businesses','offers','documents','stock','orders','jobs','members','settings'];
 const results=await Promise.allSettled(tables.map(async name=>[name,check(await client.from(`far_voucher_${name}`).select('*'))]));
 for(const r of results){if(r.status==='rejected')throw r.reason;data[r.value[0]]=r.value[1];}
}
async function refresh(){await loadData();dashboard();}
function dashboard(){
 stopCamera();
 const stock=data.stock||[],available=stock.filter(s=>s.status==='available').length,issued=stock.filter(s=>s.status==='issued').length,redeemed=stock.filter(s=>s.status==='redeemed').length;
 const needs=data.jobs.filter(j=>j.state!=='sent').length+data.orders.filter(o=>o.status==='refund_review'||o.last_payment_error).length;
 root.innerHTML=heading('Your voucher desk.','Agreements, stock and advertising — together, with less chasing.',statusPill(data.settings[0]?.sales_enabled?'Sales open':'Sales paused',!data.settings[0]?.sales_enabled))+`<div class="stats"><div class="stat"><small>Ready to sell</small><strong>${available}</strong><small>Across ${data.offers.length} offers</small></div><div class="stat"><small>With customers</small><strong>${issued}</strong><small>Paid, waiting to be redeemed</small></div><div class="stat"><small>Redeemed</small><strong>${redeemed}</strong><small>Single use, recorded securely</small></div><div class="stat"><small>To follow up</small><strong>${needs}</strong><small>Email or accounting tasks</small></div></div><nav class="tabs" aria-label="Voucher management">${[['overview','Overview'],['offers','Offers & stock'],['businesses','Businesses'],['sync','Connections'],['redeem','Redeem']].map(([id,label])=>`<button data-tab="${id}" class="${activeTab===id?'active':''}">${label}</button>`).join('')}</nav><section id="tab"></section>`;
 document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{activeTab=b.dataset.tab;dashboard();});
 if(activeTab==='overview')overview();if(activeTab==='offers')offers();if(activeTab==='businesses')businesses();if(activeTab==='sync')connections();if(activeTab==='redeem')redeem($('#tab'));
}
function overview(){
 const campaigns=[...data.offers].sort((a,b)=>a.campaign_start.localeCompare(b.campaign_start));
 const now=today();
 $('#tab').innerHTML=`<div class="grid"><section class="panel"><div class="section-title"><h2>Advertising commitments</h2><small>${campaigns.length} agreements</small></div>${campaigns.length?campaigns.map(o=>{
  const state=now<o.campaign_start?'Upcoming':now>o.campaign_end?'Finished':'In progress';const ratio=Math.max(0,Math.min(100,(Date.now()-Date.parse(o.campaign_start))/(Date.parse(o.campaign_end)-Date.parse(o.campaign_start)||1)*100));
  return `<article class="timeline"><div class="section-title"><h3>${esc(businessName(o.business_id))}</h3>${statusPill(state,state==='Upcoming')}</div><p>${esc(o.package_name)} · ${esc(o.title)}</p><p class="dates">${day(o.campaign_start)} → ${day(o.campaign_end)}</p><p>${esc(o.commitment)}</p><div class="bar"><span style="width:${ratio}%"></span></div></article>`;
 }).join(''):empty('Your first agreement starts here.','Add a business, then create its voucher offer and advertising dates.')}</section><aside class="panel"><p class="eyebrow">A SIMPLE ROUTINE</p><h2>Upload once. Keep track.</h2><div class="step"><b>1</b><div><h3>Add the agreement</h3><p>Record the package and dates, then upload the signed document.</p></div></div><div class="step"><b>2</b><div><h3>Load the voucher stock</h3><p>Upload the business’s voucher file and confirm the quantity or import its codes.</p></div></div><div class="step"><b>3</b><div><h3>Let the hub do the counting</h3><p>Paid vouchers reduce stock. Businesses redeem with a scan or a code.</p></div></div><div class="actions"><button id="add-first">Add an offer</button><button class="quiet" id="export">Export register</button></div></aside></div>`;
 $('#add-first').onclick=()=>{activeTab='offers';dashboard();$('#new-offer').click();};$('#export').onclick=exportRegister;
}
function businesses(){
 $('#tab').innerHTML=`<div class="grid"><section class="panel"><div class="section-title"><h2>Your businesses</h2></div>${data.businesses.length?`<div class="table-wrap"><table><thead><tr><th>Business</th><th>Approved logins</th><th>Access</th></tr></thead><tbody>${data.businesses.map(b=>`<tr><td><strong>${esc(b.name)}</strong><p>${esc(b.contact_email)}</p></td><td>${data.members.filter(m=>m.business_id===b.id).map(m=>`<p>${esc(m.email)}</p>`).join('')||'<small>No business login yet</small>'}</td><td><button class="quiet" data-pause="${b.id}">${b.active?'Pause':'Restore'}</button></td></tr>`).join('')}</tbody></table></div>`:empty('No businesses yet.','Add the first business using the form alongside.')}</section><aside><section class="panel"><h2>Add a business</h2><p class="muted">Keep each business’s vouchers and access separate.</p><form id="business-form"><div class="form-grid"><div class="full"><label for="business-name">Business name</label><input id="business-name" name="name" maxlength="160" required></div><div class="full"><label for="business-email">Contact email</label><input id="business-email" name="email" type="email" required></div></div><div class="actions"><button type="submit">Save business</button></div></form></section><section class="panel"><h2>Approve a business login</h2><p class="muted">Invite a work email to check only this business’s vouchers. FAR sends the sign-in invitation.</p><form id="member-form"><label for="member-business">Business</label><select id="member-business" name="business" required><option value="">Choose business</option>${data.businesses.map(b=>`<option value="${b.id}">${esc(b.name)}</option>`).join('')}</select><label for="member-email">Work email</label><input id="member-email" name="email" type="email" required><div class="actions"><button type="submit">Approve &amp; invite</button></div></form></section></aside></div>`;
 bindForm('#business-form',async fd=>{check(await client.from('far_voucher_businesses').insert({name:fd.get('name').trim(),contact_email:fd.get('email').trim().toLowerCase()}));toast('Business saved');await refresh();});
 bindForm('#member-form',async fd=>{const business=fd.get('business'),email=fd.get('email').trim().toLowerCase();check(await client.from('far_voucher_members').upsert({business_id:business,email}));const result=await api('invite',{business,email});toast(result.existing?'Email approved. They can now request a sign-in link.':'Email approved and invitation sent.');await refresh();});
 document.querySelectorAll('[data-pause]').forEach(b=>b.onclick=async()=>{try{const business=data.businesses.find(x=>x.id===b.dataset.pause);check(await client.from('far_voucher_businesses').update({active:!business.active}).eq('id',business.id));await refresh();}catch(e){toast(e.message,true);}});
}
function offers(){
 $('#tab').innerHTML=`<section class="panel"><div class="section-title"><h2>Offers & voucher stock</h2><button id="new-offer">＋ New offer</button></div>${data.offers.length?`<div class="table-wrap"><table><thead><tr><th>Business / offer</th><th>Stock</th><th>Advertising</th><th>Status</th><th></th></tr></thead><tbody>${data.offers.map(o=>{const stock=data.stock.filter(s=>s.offer_id===o.id);return `<tr><td><strong>${esc(o.title)}</strong><p>${esc(businessName(o.business_id))} · ${money(o.sale_minor)}</p></td><td>${stock.filter(s=>s.status==='available').length} available<p>${stock.length} total · ${stock.filter(s=>s.status==='redeemed').length} redeemed</p></td><td>${day(o.campaign_start)}<p>to ${day(o.campaign_end)}</p></td><td>${statusPill(o.active?'Listed':'Draft',!o.active)}</td><td><button class="quiet" data-offer="${o.id}">Manage</button></td></tr>`;}).join('')}</tbody></table></div>`:empty('No voucher offers yet.','Create an offer, attach the agreement and add the stock before listing it.')}</section><section id="offer-editor"></section>`;
 $('#new-offer').onclick=()=>offerEditor();document.querySelectorAll('[data-offer]').forEach(b=>b.onclick=()=>offerEditor(data.offers.find(o=>o.id===b.dataset.offer)));
}
const field=(name,label,type='text',value='',required=true,full=false)=>`<div class="${full?'full':''}"><label for="${name}">${label}</label><input id="${name}" name="${name}" type="${type}" value="${esc(type==='date'?String(value).slice(0,10):value)}" ${required?'required':''}></div>`;
function offerEditor(offer){
 const o=offer||{},locked=o.id&&data.orders.some(r=>r.offer_id===o.id);
 $('#offer-editor').innerHTML=`<section class="panel" style="margin-top:22px"><div class="section-title"><h2>${o.id?'Manage offer':'Create a voucher offer'}</h2><button id="close-editor" class="quiet">Close</button></div>${locked?'<p class="muted">This offer has orders. Its terms and dates are protected; create a new offer for changes.</p>':''}<form id="offer-form"><fieldset style="border:0;padding:0;margin:0" ${locked?'disabled':''}><div class="form-grid"><div class="full"><label for="offer-business">Business</label><select id="offer-business" name="business_id" required><option value="">Choose business</option>${data.businesses.map(b=>`<option value="${b.id}" ${o.business_id===b.id?'selected':''}>${esc(b.name)}</option>`).join('')}</select></div>${field('title','Offer title','text',o.title||'',true,true)}${field('face','Voucher face value (£)','number',o.face_minor?o.face_minor/100:'')}${field('sale','Customer price (£)','number',o.sale_minor?o.sale_minor/100:'')}${field('agreed_quantity','Vouchers business will supply','number',o.agreed_quantity||1)}${field('expires_on','Voucher expiry','date',o.expires_on||'')}${field('package_name','Advertising package','text',o.package_name||'')}${field('advertising_credit','Advertising credit (£)','number',(o.advertising_credit_minor||0)/100)}${field('campaign_start','Advertising starts','date',o.campaign_start||'')}${field('campaign_end','Advertising ends','date',o.campaign_end||'')}${['entitlement','terms','redemption_instructions','commitment'].map(name=>`<div class="full"><label for="${name}">${({entitlement:'What the customer receives',terms:'Voucher terms',redemption_instructions:'How to use the voucher',commitment:'What FAR has agreed to deliver'})[name]}</label><textarea id="${name}" name="${name}" required>${esc(o[name]||'')}</textarea></div>`).join('')}</div></fieldset><div class="actions">${!locked?'<button type="submit">Save offer</button>':''}${o.id?`<button type="button" class="quiet" id="agreement-draft">Create agreement draft</button><button type="button" class="quiet" id="toggle-offer">${o.active?'Unlist offer':'List offer'}</button>`:''}</div></form>${o.id?`<div class="grid" style="margin-top:28px"><section class="panel"><h2>Agreement & voucher files</h2><p class="muted">Files are private to FAR staff. PDF, JPG, PNG or CSV, up to 10 MB.</p><div id="documents">${data.documents.filter(d=>d.offer_id===o.id).map(d=>`<p><button class="quiet" type="button" data-doc="${d.id}">${esc(d.name)}</button> <small>${esc(d.kind.replace('_',' '))}</small></p>`).join('')||'<p class="muted">No files uploaded.</p>'}</div><form id="document-form"><label for="document-kind">File type</label><select id="document-kind" name="kind"><option value="agreement">Signed agreement</option><option value="voucher_batch">Business voucher file</option></select><label for="document-file">Choose file</label><input id="document-file" name="file" type="file" accept=".pdf,.jpg,.jpeg,.png,.csv" required><div class="actions"><button type="submit">Upload privately</button></div></form></section><section class="panel"><h2>Add voucher stock</h2><p class="muted">Enter the agreed quantity, or paste one original business code per line. Each voucher gets its own FAR code.</p><form id="stock-form"><label for="quantity">Number of vouchers</label><input id="quantity" name="quantity" type="number" min="1" max="1000" value="${Math.max(1,(o.agreed_quantity||1)-data.stock.filter(s=>s.offer_id===o.id).length)}" required><label for="supplier-codes">Original business codes (optional)</label><textarea id="supplier-codes" name="codes" placeholder="One code per line"></textarea><label><input name="confirmed" type="checkbox" required>I have checked the quantity against the agreement and uploaded the voucher file.</label><div class="actions"><button type="submit">Add to stock</button></div></form></section></div>`:''}</section>`;
 ['face','sale','advertising_credit'].forEach(n=>{const input=$(`#${n}`);input.min=n==='advertising_credit'?'0':'0.01';input.step='0.01';});
 const quantityInput=$('#agreed_quantity');quantityInput.min='1';quantityInput.max='1000000';quantityInput.step='1';
 $('#advertising_credit').readOnly=true;$('#sale').readOnly=true;
 $('#advertising_credit').insertAdjacentHTML('afterend','<small>£1 of advertising for every £1 of vouchers at face value. Resale price does not change this.</small>');
 $('#sale').insertAdjacentHTML('afterend','<small>Face value rounded to the nearest £1 (50p rounds up), then halved.</small>');
 const calculateCredit=()=>{try{const face=Math.round(Number($('#face').value)*100);$('#sale').value=(customerPrice(face)/100).toFixed(2);$('#advertising_credit').value=(advertisingCredit(face,Number(quantityInput.value))/100).toFixed(2);}catch{$('#advertising_credit').value='';$('#sale').value='';}};
 $('#face').addEventListener('input',calculateCredit);quantityInput.addEventListener('input',calculateCredit);calculateCredit();
 $('#close-editor').onclick=()=>$('#offer-editor').replaceChildren();
 bindForm('#offer-form',async fd=>{
  const value={business_id:fd.get('business_id'),title:fd.get('title').trim(),face_minor:Math.round(Number(fd.get('face'))*100),sale_minor:Math.round(Number(fd.get('sale'))*100),agreed_quantity:Number(fd.get('agreed_quantity')),advertising_credit_minor:advertisingCredit(Math.round(Number(fd.get('face'))*100),Number(fd.get('agreed_quantity')))};
  for(const n of ['expires_on','package_name','campaign_start','campaign_end','entitlement','terms','redemption_instructions','commitment'])value[n]=fd.get(n);
  if(value.campaign_end<value.campaign_start)throw Error('Advertising must end on or after its start date');
  const saved=check(await (o.id?client.from('far_voucher_offers').update(value).eq('id',o.id):client.from('far_voucher_offers').insert(value)).select().single());
  await loadData();dashboard();offerEditor(saved);toast('Offer saved. Add its files and stock next.');
 });
 $('#agreement-draft')?.addEventListener('click',()=>{try{const html=agreementDraft(o,data.businesses.find(b=>b.id===o.business_id));const link=document.createElement('a');link.href=URL.createObjectURL(new Blob([html],{type:'text/html;charset=utf-8'}));link.download='FAR-agreement-DRAFT-'+o.id+'.html';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);toast('Draft downloaded. Review, complete and sign it before uploading the final agreement.');}catch(e){toast(e.message,true);}});
 $('#toggle-offer')?.addEventListener('click',async()=>{try{
  if(!o.active&&data.stock.filter(s=>s.offer_id===o.id).length!==(o.agreed_quantity||1))throw Error('Add the full agreed voucher quantity before listing');
  if(!o.active&&(!data.documents.some(d=>d.offer_id===o.id&&d.kind==='agreement')||!data.stock.some(s=>s.offer_id===o.id&&s.status==='available')))throw Error('Upload the signed agreement and add stock before listing');
  check(await client.from('far_voucher_offers').update({active:!o.active}).eq('id',o.id));await refresh();toast(o.active?'Offer unlisted':'Offer listed. Sales remain controlled separately.');
 }catch(e){toast(e.message,true);}});
 bindForm('#document-form',async fd=>{
  const file=fd.get('file');if(file.size>10*1024*1024)throw Error('Choose a file smaller than 10 MB');
  const extension=file.name.split('.').pop().toLowerCase();if(!['pdf','jpg','jpeg','png','csv'].includes(extension))throw Error('Choose a PDF, image or CSV');
  const path=`${o.business_id}/${o.id}/${crypto.randomUUID()}.${extension}`;
  check(await client.storage.from('far-voucher-documents').upload(path,file,{contentType:file.type||'text/csv',upsert:false}));
  check(await client.from('far_voucher_documents').insert({business_id:o.business_id,offer_id:o.id,kind:fd.get('kind'),name:file.name,path}));
  await loadData();offerEditor(data.offers.find(x=>x.id===o.id));toast('File uploaded privately');
 });
 document.querySelectorAll('[data-doc]').forEach(b=>b.onclick=async()=>{try{const d=data.documents.find(x=>x.id===b.dataset.doc);const link=check(await client.storage.from('far-voucher-documents').createSignedUrl(d.path,60));window.open(link.signedUrl,'_blank','noopener,noreferrer');}catch(e){toast(e.message,true);}});
 bindForm('#stock-form',async fd=>{
  if(!data.documents.some(d=>d.offer_id===o.id&&d.kind==='agreement')||!data.documents.some(d=>d.offer_id===o.id&&d.kind==='voucher_batch'))throw Error('Upload the agreement and business voucher file first');
  const qty=Number(fd.get('quantity')),codes=String(fd.get('codes')).split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  if(codes.length&&codes.length!==qty)throw Error('The number of codes must match the voucher quantity');
  if(new Set(codes).size!==codes.length)throw Error('There are duplicate business codes');
  // Retain this batch key after a network error; retry cannot double the stock.
  const form=$('#stock-form');form.dataset.batch||=crypto.randomUUID();
  const n=await rpc('far_voucher_import',{p_offer:o.id,p_import:form.dataset.batch,p_codes:codes.length?codes:Array(qty).fill('')});
  await loadData();dashboard();offerEditor(data.offers.find(x=>x.id===o.id));toast(`${n} vouchers added`);
 });
 $('#offer-editor').scrollIntoView({behavior:'smooth',block:'start'});
}
async function connections(){
 $('#tab').innerHTML=`<div class="grid"><section class="panel"><h2>Your connections</h2><div id="connections" class="connections"><p class="muted">Checking connections…</p></div><p class="muted">The hub holds voucher stock. SumUp handles payment. Pandle receives sales and processing fees through the accounting queue.</p></section><section class="panel"><div class="section-title"><h2>Delivery & accounting queue</h2><button id="reload" class="quiet">Refresh</button></div><div id="jobs"></div></section></div>`;
 $('#reload').onclick=refresh;
 try{
  const c=await api('connections');
  $('#connections').innerHTML=[['SumUp',c.sumup,'Hosted customer checkout. No card details are stored by FAR.'],['Voucher email',c.email,'Sends the voucher code and a link to its QR code after verified payment.'],['Pandle',c.pandle,c.pandle_session?'API session saved. Final posting checks are still required.':'Gross sales and fees use the agreed FAR categories.'],['Live sales',c.sales&&data.settings[0]?.sales_enabled,'Both payment controls must be enabled before a customer can pay.']].map(([name,ready,detail])=>`<div class="connection"><div><strong>${name}</strong><p>${detail}</p></div>${statusPill(ready?'Configured':'Not enabled',!ready)}</div>`).join('');
  if(c.can_configure){
   $('#connections').insertAdjacentHTML('afterend',`<div class="actions"><button type="button" id="verify-connections" class="quiet">Check connections</button></div><div id="connection-checks" role="status"></div><details style="margin-top:24px"><summary>Connect Pandle securely</summary><p class="muted">Your Pandle login goes through FAR’s secure Supabase server to Pandle’s API. Your password is used once and is not stored. Only a renewable API session is saved on the server. This checks access and selects the FAR accounts; it does not post transactions.</p><form id="pandle-connect"><label for="pandle-email">Pandle email</label><input id="pandle-email" name="email" type="email" autocomplete="username" required><label for="pandle-password">Pandle password</label><input id="pandle-password" name="password" type="password" autocomplete="current-password" required><label><input type="checkbox" required>I approve this secure connection and storage of the API session.</label><div class="actions"><button type="submit">Connect and check Pandle</button></div></form></details>`);
   $('#verify-connections').onclick=async event=>{event.currentTarget.disabled=true;try{const result=await api('connections',{verify:true});$('#connection-checks').innerHTML=`<p style="margin-top:18px">SumUp: ${esc(result.sumup_message)}</p><p>${esc(result.email_message)}</p>${result.email_domains.map(d=>`<p>${esc(d.name)}: ${esc(d.status)}</p>`).join('')}`;}catch(e){toast(e.message,true);}finally{if($('#verify-connections'))$('#verify-connections').disabled=false;}};
   bindForm('#pandle-connect',async(fd,form)=>{const email=String(fd.get('email')),password=String(fd.get('password'));form.reset();const result=await api('pandle_connect',{email,password});toast(result.message);await refresh();});
  }
 }catch{$('#connections').innerHTML=empty('Connections are not ready.','The server connection still needs configuring. Payments remain unavailable.');}
 $('#jobs').innerHTML=data.jobs.length?`<div class="table-wrap"><table><thead><tr><th>Task</th><th>Status</th><th></th></tr></thead><tbody>${data.jobs.slice().sort((a,b)=>a.state.localeCompare(b.state)).slice(0,100).map(j=>`<tr><td>${({email:'Voucher email',pandle_sale:'Pandle sale',pandle_fee:'Pandle fee'})[j.kind]}<p>${esc(j.last_error||j.order_id)}</p></td><td>${esc(j.state)}</td><td>${j.state!=='sent'&&j.state!=='processing'?`<button class="quiet" data-retry="${j.id}">Retry</button>`:''}</td></tr>`).join('')}</tbody></table></div>`:empty('Nothing waiting.','After a sale, voucher emails and accounting updates appear here.');
 const exceptions=data.orders.filter(o=>o.status==='refund_review'||o.last_payment_error);
 if(exceptions.length)$('#jobs').insertAdjacentHTML('beforeend','<h3 style="margin-top:24px">Payments needing review</h3>'+exceptions.map(o=>'<p class="muted">'+esc(offerTitle(o.offer_id))+' · '+esc(o.status)+'<br>'+esc(o.last_payment_error||'Refund or chargeback: reconcile the original sale and refund.')+'</p>').join(''));
 document.querySelectorAll('[data-retry]').forEach(b=>b.onclick=async()=>{try{await api('retry',{id:b.dataset.retry});toast('Task queued for the next automatic run');await refresh();}catch(e){toast(e.message,true);}});
}
function stopCamera(){clearTimeout(scanTimer);stream?.getTracks().forEach(t=>t.stop());stream=null;}
function normalizeCode(value){try{const u=new URL(value);if(u.searchParams.get('voucher'))return u.searchParams.get('voucher');}catch{}return value.trim();}
function redeem(container=root){
 stopCamera();
 container.innerHTML=`<div class="redeem">${context.admin?'':heading('Check. Confirm. Redeem.','For '+context.businesses.map(b=>esc(b.name)).join(', '))}<section class="panel"><p class="eyebrow">BUSINESS REDEMPTION</p><h2>Check a customer’s voucher</h2><p class="muted">Scan the QR code or type the FAR code. Check the details before accepting it.</p><form id="redeem-form"><label for="voucher-code">FAR voucher code</label><input id="voucher-code" name="code" autocomplete="off" spellcheck="false" required placeholder="FAR-…" value="${esc(params.get('voucher')||'')}"><div class="actions"><button type="submit">Check voucher</button><button type="button" id="scan" class="quiet">Scan QR code</button></div></form><video id="camera" playsinline muted hidden></video><button id="stop-scan" class="quiet" hidden>Stop camera</button><div id="voucher-result" aria-live="polite"></div></section></div>`;
 bindForm('#redeem-form',async fd=>{stopCamera();showResult(await rpc('far_voucher_lookup',{p_code:normalizeCode(String(fd.get('code'))),p_redeem:false}));});
 $('#scan').onclick=async()=>{
  try{
   stopCamera();stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
   const video=$('#camera');video.srcObject=stream;video.hidden=false;$('#stop-scan').hidden=false;await video.play();
   const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true});
   const read=()=>{if(!stream)return;if(video.readyState>=2){canvas.width=video.videoWidth;canvas.height=video.videoHeight;ctx.drawImage(video,0,0);const img=ctx.getImageData(0,0,canvas.width,canvas.height),code=jsQR(img.data,img.width,img.height,{inversionAttempts:'attemptBoth'});if(code){$('#voucher-code').value=normalizeCode(code.data);stopCamera();video.hidden=true;$('#stop-scan').hidden=true;$('#redeem-form').requestSubmit();return;}}scanTimer=setTimeout(read,180);};read();
  }catch{stopCamera();toast('Camera unavailable. Type the FAR code instead.',true);}
 };
 $('#stop-scan').onclick=()=>{stopCamera();$('#camera').hidden=true;$('#stop-scan').hidden=true;};
}
function showResult(result){
 const good=['valid','success'].includes(result.result);
 $('#voucher-result').innerHTML=`<div class="result${good?'':' bad'}"><h2>${({valid:'Ready to redeem',success:'Voucher redeemed',redeemed:'Already redeemed',expired:'Voucher expired',not_found:'Code not found',not_valid:'Do not accept',inactive:'Access paused'})[result.result]||'Check required'}</h2><p>${esc(result.message)}</p>${result.code?`<code>${esc(result.code)}</code><h3>${esc(result.title)}</h3><p>${esc(result.entitlement)}</p><p>${esc(result.terms)}</p><small>Expires ${day(result.expires_on)}${result.redeemed_at?' · Redeemed '+new Date(result.redeemed_at).toLocaleString('en-GB'):''}</small>`:''}${result.result==='valid'?'<div class="actions"><button id="confirm-redeem">Confirm redemption</button></div>':''}</div>`;
 $('#confirm-redeem')?.addEventListener('click',async event=>{event.currentTarget.disabled=true;try{showResult(await rpc('far_voucher_lookup',{p_code:result.code,p_redeem:true}));}catch(e){toast('Could not confirm. Check the voucher again before accepting it.',true);event.currentTarget.disabled=false;}});
}
async function ticket(){
 const token=params.get('ticket');
 let t=await rpc('far_voucher_ticket',{p_token:token});
 if(!t){
  root.innerHTML=`<section class="panel login"><h1>Checking your payment</h1><p>Your voucher appears here after SumUp confirms payment. It will also be emailed to you.</p><button id="check-payment">Check again</button><p id="payment-status" class="muted"></p></section>`;
  $('#check-payment').onclick=async event=>{event.currentTarget.disabled=true;try{const status=await api('status',{token});if(status.status==='paid')await ticket();else $('#payment-status').textContent=status.status==='expired'?'This checkout has expired. No voucher was issued.':'Payment has not been confirmed yet. Please check again shortly.';}catch(e){toast(e.message,true);}finally{if($('#check-payment'))$('#check-payment').disabled=false;}};
  $('#check-payment').click();return;
 }
 root.innerHTML=`<article class="ticket"><p class="eyebrow">FENLAND ANGELS RADIO · VOUCHER</p><h1>${esc(t.title)}</h1><p>${esc(t.business)}</p>${statusPill(t.status,t.status!=='issued')}<canvas id="qr"></canvas><code>${esc(t.code)}</code><hr><p><strong>${esc(t.entitlement)}</strong></p><p>${esc(t.instructions)}</p><p>${esc(t.terms)}</p><p>Valid until <strong>${day(t.expires_on)}</strong>. Single use.</p><small>Present this QR code or FAR code to the business. The business confirms redemption in its FAR Voucher Hub.</small><div class="actions"><button id="print">Print / save voucher</button></div></article>`;
 // Customer link stays private; QR contains only the redemption code.
 await QRCode.toCanvas($('#qr'),`${location.origin}${location.pathname}?voucher=${encodeURIComponent(t.code)}`,{width:250,margin:2,color:{dark:'#16382f',light:'#fff9ed'}});$('#print').onclick=()=>window.print();
}
async function shop(){
 const catalog=await rpc('far_voucher_catalog');
 root.innerHTML=heading('Good things, closer to home.','Local business vouchers supporting Fenland Angels Radio.',statusPill(catalog.sales_open?'Voucher offers':'Coming soon',!catalog.sales_open))+`<div class="offers">${catalog.offers.length?catalog.offers.map(o=>`<article class="panel offer-card"><p class="eyebrow">${esc(o.business)}</p><h2>${esc(o.title)}</h2><p>${esc(o.entitlement)}</p><p class="price">${money(o.sale_minor)}</p><small>Voucher value ${money(o.face_minor)} · ${o.available} available</small><p class="muted">${esc(o.terms)}</p><small>Valid until ${day(o.expires_on)}</small>${catalog.sales_open&&o.available?`<form data-buy="${o.id}"><label for="buyer-${o.id}">Email for your voucher</label><input id="buyer-${o.id}" name="email" type="email" required autocomplete="email"><label><input type="checkbox" required>I accept the voucher terms shown above.</label><button type="submit">Continue to SumUp</button></form>`:'<p class="muted">Sales are not available for this offer.</p>'}</article>`).join(''):empty('Local offers are on their way.','FAR is preparing its first business agreements. Please check back soon.')}</div><div class="link-row"><a href="voucher-app.html">Staff & business sign in</a></div>`;
 document.querySelectorAll('[data-buy]').forEach(form=>form.onsubmit=async event=>{
  event.preventDefault();const button=form.querySelector('button');button.disabled=true;form.dataset.key||=crypto.randomUUID();
  try{const response=await api('checkout',{offer:form.dataset.buy,email:form.email.value.trim().toLowerCase(),key:form.dataset.key});if(response.url)location.assign(response.url);else toast('Your checkout is being prepared. Please try again shortly.');}catch(e){toast(e.message,true);}finally{button.disabled=false;}
 });
}
function exportRegister(){
 const rows=[['Business','Offer','FAR code','Supplier code','Status','Advertising starts','Advertising ends','Commitment','Redeemed at'],...data.stock.map(s=>{const o=data.offers.find(x=>x.id===s.offer_id);return [businessName(o.business_id),o.title,s.code,s.supplier_code,s.status,o.campaign_start,o.campaign_end,o.commitment,s.redeemed_at];})];
 const csv=rows.map(row=>row.map(v=>{let s=String(v??'');if(/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}).join(',')).join('\r\n');
 const link=document.createElement('a');link.href=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}));link.download=`FAR-voucher-register-${today()}.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);
}
async function init(){
 try{
  if(!config.supabaseUrl||!config.supabaseAnonKey)throw Error('The voucher hub still needs its secure connection configured. Payments are not enabled.');
  client=createClient(config.supabaseUrl,config.supabaseAnonKey);
  if(params.has('ticket')){await ticket();return;}if(params.has('shop')){await shop();return;}
  session=check(await client.auth.getSession()).session;
  if(!session){login();client.auth.onAuthStateChange((event,s)=>{if(event==='SIGNED_IN'&&s)location.reload();});return;}
  $('#logout').hidden=false;$('#logout').onclick=async()=>{stopCamera();await client.auth.signOut();location.assign(location.pathname);};
  context=await rpc('far_voucher_context');
  if(context.admin){await refresh();}else if(context.businesses.length){redeem();}else{root.innerHTML=`<section class="panel login"><h1>Your access is not ready yet.</h1><p>Ask FAR to approve this email for your business.</p></section>`;}
 }catch(e){root.innerHTML=`<section class="panel login"><h1>The hub is not ready yet.</h1><p>${esc(e.message)}</p><p>Payments remain unavailable. Please contact FAR if you need help.</p><a href="vouchers.html">Back to FAR</a></section>`;}
}
window.addEventListener('pagehide',stopCamera);document.addEventListener('visibilitychange',()=>{if(document.hidden)stopCamera();});init();

