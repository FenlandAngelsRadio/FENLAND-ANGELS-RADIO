(function () {
  'use strict';
  const prefix = 'event_media:';
  const escape = value => String(value || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function url(value) {
    try { const parsed = new URL(value); return parsed.protocol === 'https:' && !parsed.username && !parsed.password ? parsed.href : ''; }
    catch (_) { return ''; }
  }
  function valid(media) {
    return !!(media && url(media.image_url) && String(media.alt || '').trim() && String(media.credit || '').trim() && url(media.source_url) && String(media.permission_note || '').trim() && /^\d{4}-\d{2}-\d{2}$/.test(media.checked_on || '') && media.permission_confirmed === true);
  }
  async function load(db) {
    const {data, error} = await db.from('far_site_content').select('content_key,value').like('content_key', prefix + '%');
    if (error) throw new Error('Event images could not be loaded. Please try again.');
    const result = {};
    for (const row of data || []) {
      if (!row.content_key.startsWith(prefix)) continue;
      try { result[row.content_key.slice(prefix.length)] = JSON.parse(row.value); } catch (_) { /* An invalid record must not produce markup. */ }
    }
    return result;
  }
  async function save(db, event, media) {
    if (!valid(media)) throw new Error('Add an image, description, credit, source, checked date and permission confirmation before saving.');
    const {error} = await db.from('far_site_content').upsert({content_key:prefix + event.id, section:'Events', label:'Event image: ' + event.title, value:JSON.stringify(media), value_type:'textarea', updated_at:new Date().toISOString()}, {onConflict:'content_key'});
    if (error) throw new Error('The event image could not be saved. Your account may need Owner or Deputy Manager access.');
  }
  function figure(media) {
    if (!valid(media)) return '';
    const address = escape(url(media.image_url));
    return `<figure style="margin:18px 0"><a href="${address}" target="_blank" rel="noopener" aria-label="Open full event poster"><img src="${address}" alt="${escape(media.alt)}" loading="lazy" style="display:block;width:100%;max-width:420px;height:auto;border-radius:10px"></a><figcaption style="margin-top:8px;font-size:.9rem">${escape(media.credit)}</figcaption></figure>`;
  }
  function londonNow(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-GB', {timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date);
    const values = Object.fromEntries(parts.map(p => [p.type,p.value]));
    return {day:`${values.year}-${values.month}-${values.day}`,time:`${values.hour}:${values.minute}`};
  }
  function upcoming(event, now = londonNow()) {
    if (event.event_date !== now.day) return event.event_date > now.day;
    // An end earlier than the start is not assumed to be a same-day finish.
    return !event.end_time || (event.start_time && event.end_time < event.start_time) || event.end_time.slice(0,5) > now.time;
  }
  window.FAREventMedia = {escape,url,valid,load,save,figure,londonNow,upcoming};
})();