const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const source = file => fs.readFileSync(path.join(root, file), 'utf8');
const navigationContext = {window: {location: {href:'https://far.test/index.html', origin:'https://far.test'}}, URL};
vm.runInNewContext(source('far-navigation.js'), navigationContext);
const nav = navigationContext.window.FARNavigation;
const page = {id:1,slug:'appeal',title:'Appeal',published:true,show_in_navigation:true,navigation_location:'community',sort_order:10};
assert.equal(nav.resolve([], [page]).length, 1);
assert.equal(nav.resolve([], [{...page,published:false}]).length, 0);
assert.equal(nav.resolve([], [{...page,show_in_navigation:false}]).length, 0);
assert.equal(nav.resolve([], [{...page,navigation_location:'hidden'}]).length, 0);
assert.equal(nav.resolve([{id:2,enabled:false,href:'news.html',location:'news'}], []).length, 0);
assert.equal(nav.resolve([{id:2,enabled:true,href:'javascript:alert(1)',location:'news'}], []).length, 0);
assert.equal(nav.safeHref('data:text/html,test'), null);
assert.equal(nav.resolve([{id:2,enabled:true,href:'page.html?slug=appeal',location:'news'}], [page]).length, 1);
assert.equal(nav.resolve([{id:2,enabled:true,href:'page.html?slug=missing',location:'news'}], []).length, 0);
const dashboard = source('admin-dashboard.html');
const modules = [...dashboard.matchAll(/class="admin-card" data-permission="([^"]+)" href="([^"]+)"/g)].map(m => ({permission:m[1],href:m[2]}));
assert.equal(modules.length, [...dashboard.matchAll(/class="admin-card" data-permission=/g)].length, 'Every permission-gated module must have a destination');
assert.equal(new Set(modules.map(m=>m.href)).size, modules.length, 'Duplicate dashboard destination');
// Multiple tools can intentionally share one existing permission. Discovery
// reuses Website Pages access; it must not create or bypass an access grant.
assert.deepEqual(modules.filter(m=>m.permission==='pages').map(m=>m.href), ['admin-discovery.html','admin-pages.html']);
const cards = modules.map(({permission,href}) => ({dataset:{permission},href,style:{},hidden:false}));
const managementCards = [{style:{},hidden:false}];
const group = {querySelectorAll:()=>cards};
const document = {querySelectorAll: selector => selector==='[data-permission]'?cards:selector==='[data-management-only]'?managementCards:[group]};
const body=dashboard.match(/function applyAccess\(admin\)\{([\s\S]*?)\n  \}/)[1];
const apply=vm.runInNewContext('(function(admin){'+body+'})',{document});
apply({role:'staff',permissions:['pages','events']});
assert.deepEqual(cards.filter(c=>!c.hidden).map(c=>c.href),['admin-events.html','admin-discovery.html','admin-pages.html']);
assert.equal(managementCards[0].hidden,true);
apply({role:'staff',permissions:['pages']});
assert.deepEqual(cards.filter(c=>!c.hidden).map(c=>c.href),['admin-discovery.html','admin-pages.html']);
apply({role:'staff',permissions:['events']});
assert.equal(cards.filter(c=>c.dataset.permission==='pages').every(c=>c.hidden),true);
apply({role:'staff',permissions:['not-a-module']});assert.equal(cards.every(c=>c.hidden),true);
apply({role:'staff',permissions:[]});assert.equal(group.hidden,true);
for(const role of ['owner','deputy_manager']){apply({role,permissions:[]});assert.equal(cards.every(c=>!c.hidden),true);assert.equal(managementCards[0].hidden,false);}
let parsed=0;
for(const file of fs.readdirSync(root).filter(f=>f.endsWith('.html'))){
 const html=source(file);
 for(const script of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))if(script[1].trim()){new vm.Script(script[1],{filename:file});parsed++;}
 assert.ok((html.match(/src="site-nav\.js/g)||[]).length<=1, file+' loads navigation more than once');
 const markup=html.replace(/<script(?![^>]*src=)[^>]*>[\s\S]*?<\/script>/g,'');
 for(const link of markup.matchAll(/(?:src|href)="([^"<>]+)"/g)){
  const href=link[1];if(/^(https?:|mailto:|tel:|data:|#)/i.test(href))continue;
  const target=decodeURIComponent(href.split(/[?#]/)[0]);if(!target)continue;
  assert.ok(fs.existsSync(path.join(root,target)),file+' refers to missing '+target);
 }
}
for(const file of ['site-nav.js','far-navigation.js','admin-navigation.js'])new vm.Script(source(file),{filename:file});
console.log('Passed: navigation safety/publication, dashboard permissions, unique modules, local links/assets, single navigation include, '+parsed+' inline scripts.');
(async()=>{
 for(const file of ['admin-pages.html','admin-website-manager.html']){
  const body=source(file).match(/async function change\(query,message\)\{([\s\S]*?)return true\}/)[1];
  const status={textContent:''};
  const change=vm.runInNewContext('(async function(query,message){'+body+'return true})',{status});
  assert.equal(await change(Promise.resolve({error:{message:'permission denied'}}),'Saved'),false);
  assert.match(status.textContent,/could not be saved/);
  assert.equal(await change(Promise.resolve({error:null}),'Visibility saved.'),true);
  assert.equal(status.textContent,'Visibility saved.');
 }
 console.log('Passed: failed mutations show help; successful mutations report success.');
})().catch(error=>{console.error(error);process.exitCode=1;});
