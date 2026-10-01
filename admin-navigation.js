(async () => {
  const $ = id => document.getElementById(id);
  const status = $('status'), form = $('navigationForm');
  const db = supabase.createClient(FAR_EVENTS_CONFIG.SUPABASE_URL, FAR_EVENTS_CONFIG.SUPABASE_ANON_KEY);
  const {data: {session}} = await db.auth.getSession();
  if (!session) { window.location.href = 'admin-dashboard.html'; return; }
  const {data: admin, error} = await db.from('far_admins').select('role,permissions').eq('user_id', session.user.id).maybeSingle();
  const management = ['owner', 'deputy_manager'].includes((admin?.role || '').toLowerCase());
  const can = permission => management || (admin?.permissions || []).includes(permission);
  if (error || !admin || !can('navigation')) { status.textContent = 'Your account cannot manage Navigation. Return to FAR Admin to choose an available tool.'; return; }
  $('app').hidden = false;
  let items = [], pages = [];
  function message(text) { status.textContent = text; }
  function reset() { form.reset(); $('id').value = ''; $('formTitle').textContent = 'Add a link'; }
  async function change(query, success) {
    const {error} = await query;
    if (error) { message('This change could not be saved. Please try again or contact the station owner.'); return false; }
    message(success); return true;
  }
  function button(text, action, parent) {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = text;
    b.onclick = async () => { b.disabled = true; try { await action(); } catch (_) { message('This change could not be saved. Please try again.'); } finally { b.disabled = false; } };
    parent.appendChild(b); return b;
  }
  async function move(item, direction) {
    const peers = items.filter(r => r.location === item.location).sort((a,b) => a.sort_order-b.sort_order || a.id-b.id);
    const index = peers.findIndex(r => r.id === item.id), next = index + direction;
    if (next < 0 || next >= peers.length) return;
    [peers[index], peers[next]] = [peers[next], peers[index]];
    for (let i = 0; i < peers.length; i++) {
      if (!await change(db.from('far_navigation_items').update({sort_order: (i+1)*10}).eq('id', peers[i].id), 'Link moved.')) { await load(); return; }
    }
    await load();
  }
  function edit(item) {
    ['id','label','href','location','sort_order'].forEach(key => $(key).value = item[key]);
    $('enabled').checked = item.enabled; $('formTitle').textContent = 'Edit link';
    $('label').focus(); form.scrollIntoView({behavior: 'smooth', block: 'center'});
  }
  async function load() {
    try {
      ({items, pages} = await FARNavigation.read(db));
      const list = $('list'); list.replaceChildren();
      const automatic = pages.filter(p => FARNavigation.menus[p.navigation_location]).map(p => ({id:'page-'+p.id,page_id:p.id,label:p.navigation_label||p.title,href:'page.html?slug='+encodeURIComponent(p.slug),location:p.navigation_location,sort_order:p.sort_order,enabled:p.published&&p.show_in_navigation}));
      Object.entries(FARNavigation.menus).forEach(([menu, name]) => {
        const section = document.createElement('section'), title = document.createElement('h3');
        title.textContent = name; section.appendChild(title);
        const links = [...items.filter(r => r.location === menu && !FARNavigation.pageSlug(r.href)), ...automatic.filter(r => r.location === menu)].sort((a,b)=>a.sort_order-b.sort_order);
        if (!links.length) { const p=document.createElement('p');p.textContent='No links in this menu.';section.appendChild(p); }
        links.forEach(item => {
          const row = document.createElement('div'); row.className = 'row';
          const label = document.createElement('div'), strong = document.createElement('strong'), destination = document.createElement('p');
          strong.textContent = item.label; destination.className = 'muted'; destination.textContent = item.href;
          label.append(strong, destination); row.appendChild(label);
          const visibility = document.createElement('span'); visibility.textContent = item.enabled ? 'Shown' : 'Hidden'; row.appendChild(visibility);
          const actions = document.createElement('div'); actions.className = 'actions'; row.appendChild(actions);
          if (item.page_id) {
            const p=document.createElement('p');p.className='muted';p.textContent='Link from Pages. Its menu and publishing settings are saved with the page.';actions.appendChild(p);
            if (can('pages')) {
              const a=document.createElement('a');a.href='admin-pages.html?edit='+item.page_id;a.className='back';a.textContent='Edit / move page link';actions.appendChild(a);
              const page=pages.find(p=>p.id===item.page_id);
              if(page.published)button(item.enabled?'Hide':'Show',async()=>{if(await change(db.from('far_custom_pages').update({show_in_navigation:!page.show_in_navigation}).eq('id',page.id),'Page link visibility saved.'))await load();},actions);
              else {const note=document.createElement('p');note.textContent='Draft — publish in Pages before showing its link.';actions.appendChild(note);}
            } else {const note=document.createElement('p');note.textContent='Pages permission is needed to change a page’s own link.';actions.appendChild(note);}
          } else {
            button('Edit / move to another menu', ()=>edit(item), actions);
            button('Move up', ()=>move(item,-1), actions);
            button('Move down', ()=>move(item,1), actions);
            button(item.enabled ? 'Hide' : 'Show', async()=>{if(await change(db.from('far_navigation_items').update({enabled:!item.enabled,updated_at:new Date().toISOString()}).eq('id',item.id),'Link visibility saved.'))await load();}, actions);
            if (!item.system_key) button('Delete', async()=>{if(confirm('Delete this link? The destination page will stay available.')&&await change(db.from('far_navigation_items').delete().eq('id',item.id),'Link deleted.'))await load();}, actions);
          }
          section.appendChild(row);
        });
        list.appendChild(section);
      });
    } catch (_) { message('Navigation could not be loaded. Please try again or contact the station owner.'); }
  }
  form.onsubmit = async event => {
    event.preventDefault();
    const label=$('label').value.trim(), href=$('href').value.trim();
    if (!label || !href || !FARNavigation.safeHref(href)) { message('Enter a link name and a website address, such as events.html or https://example.com.'); return; }
    if (FARNavigation.pageSlug(href)) { message('Set this page’s menu name, position and visibility in Pages. This keeps one place to manage its link.'); return; }
    const item={label,href,location:$('location').value,sort_order:Number($('sort_order').value)||0,enabled:$('enabled').checked,updated_at:new Date().toISOString()};
    $('save').disabled=true;
    try {
      const query=$('id').value?db.from('far_navigation_items').update(item).eq('id',$('id').value):db.from('far_navigation_items').insert(item);
      if(await change(query,'Link saved. The public menu updates when visitors next open a page.')){reset();await load();}
    } catch (_) { message('This link could not be saved. Please try again.'); }
    finally { $('save').disabled=false; }
  };
  $('clear').onclick=reset; reset(); message('Manage the links visitors see. Hidden links stay here so you can show them again.'); await load();
})();
