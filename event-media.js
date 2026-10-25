(function () {
  'use strict';
  const prefix = 'event_media:';
  function isDay(value) { return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value+'T12:00:00Z')) && new Date(value+'T12:00:00Z').toISOString().slice(0,10) === value; }
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
      try { const value = JSON.parse(row.value); if(value && typeof value === 'object' && !Array.isArray(value)) result[row.content_key.slice(prefix.length)] = value; } catch (_) { /* An invalid record must not produce markup. */ }
    }
    return result;
  }
  function checkDates(event, endDate) {
    if(!isDay(event.event_date) || (endDate && (!isDay(endDate) || endDate < event.event_date))) throw new Error('The final date must be a valid date on or after the saved event start date.');
  }
  async function persist(db,event,media) {
    checkDates(event,media.end_date);
    const saved={...media,start_date:event.event_date};
    const {error}=await db.from('far_site_content').upsert({content_key:prefix+event.id,section:'Events',label:'Event dates and image: '+event.title,value:JSON.stringify(saved),value_type:'textarea',updated_at:new Date().toISOString()},{onConflict:'content_key'});
    if(error)throw new Error(error.message || 'The event dates or image could not be saved.');
    return saved;
  }
  async function save(db,event,media) {
    if(!valid(media))throw new Error('Add an image, description, credit, source, checked date and permission confirmation before saving.');
    const existing=await load(db);
    return persist(db,event,{...(existing[event.id]||{}),...media});
  }
  async function saveDates(db,event,endDate) {
    checkDates(event,endDate);
    const existing=await load(db);
    return persist(db,event,{...(existing[event.id]||{}),end_date:endDate||null});
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
  function finalDate(event) {
    const end = event.end_date || '';
    return isDay(end) && end >= event.event_date ? end : event.event_date;
  }
  function dateRange(event) {
    return finalDate(event) === event.event_date ? [event.event_date] : [event.event_date, finalDate(event)];
  }
  function months(event, from = londonNow().day.slice(0,7)) {
    let key = event.event_date.slice(0,7);
    const end = finalDate(event).slice(0,7), values = [];
    while (key <= end) {
      if (key >= from) values.push(key);
      const [year,month] = key.split('-').map(Number);
      key = month === 12 ? (year+1) + '-01' : year + '-' + String(month+1).padStart(2,'0');
    }
    return values;
  }
  function upcoming(event, now = londonNow()) {
    const end = finalDate(event);
    if (end !== now.day) return end > now.day;
    // An end earlier than the start is not assumed to be a same-day finish.
    return !event.end_time || (event.start_time && event.end_time < event.start_time) || event.end_time.slice(0,5) > now.time;
  }
  window.FAREventMedia = {escape,url,valid,isDay,load,save,saveDates,figure,londonNow,finalDate,dateRange,months,upcoming};
})();