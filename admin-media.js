(function () {
  const types = {'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif'};
  function validate(file) {
    if (!types[file.type]) throw new Error('Choose a JPG, PNG, WebP or GIF image.');
    if (!file.size) throw new Error('This file is empty. Choose another image.');
    if (file.size > 10485760) throw new Error('This image is too large. Choose an image smaller than 10 MB.');
  }
  async function upload(db, file, folder) {
    validate(file);
    const path = folder + '/' + crypto.randomUUID() + '.' + types[file.type];
    const bucket = db.storage.from('far-cms-media');
    let result;
    try {result=await bucket.upload(path, file, {cacheControl:'3600',upsert:false});}
    catch(e) {throw new Error('The upload could not finish. Check your internet connection and try again.');}
    const {error}=result;
    if (error) {
      if (/preview/i.test(error.message || '')) throw new Error(error.message);
      throw new Error('The image could not be uploaded. Try again. If it still fails, ask the station owner to check image upload access.');
    }
    return bucket.getPublicUrl(path).data.publicUrl;
  }
  function attach(input, {db, role, folder, saveButtons=[], saveLabel='Save', label='image'}) {
    const wrap = document.createElement('div');
    wrap.className = 'far-image-control';
    const choose = document.createElement('button'); choose.type='button'; choose.textContent='Choose '+label; choose.className='btn secondary';
    const remove = document.createElement('button'); remove.type='button'; remove.textContent='Remove image'; remove.className='btn secondary';
    const picker = document.createElement('input'); picker.type='file'; picker.accept=Object.keys(types).join(','); picker.hidden=true;
    const help = document.createElement('p'); help.className='muted';
    const message = document.createElement('p'); message.setAttribute('role','status'); message.setAttribute('aria-live','polite');
    const preview = document.createElement('img'); preview.alt=label+' preview'; preview.style.cssText='display:block;max-width:100%;max-height:220px;object-fit:contain;margin:10px 0';
    const advanced = document.createElement('details'); const summary=document.createElement('summary'); summary.textContent='Use an existing image address'; advanced.append(summary);
    input.before(wrap); advanced.append(input); wrap.append(choose,remove,picker,help,message,preview,advanced);
    const management=['owner','deputy_manager'].includes(role);
    choose.hidden=!management;
    help.textContent=management?'JPG, PNG, WebP or GIF · up to 10 MB. Choose an image, check the preview, then select “'+saveLabel+'”.':'Ask the Owner or Deputy Manager to upload a new image. You can keep the current image or use an existing image address below.';
    function refresh(){const url=input.value.trim(); message.textContent=''; preview.hidden=!url; preview.style.display=url?'block':'none'; if(url)preview.src=url;else preview.removeAttribute('src'); remove.hidden=!url;}
    preview.onerror=()=>{if(!input.value.trim())return;preview.hidden=true;preview.style.display='none';message.textContent='The image preview could not be loaded. Check the image address or choose another image.';};
    input.addEventListener('input',refresh);
    remove.onclick=()=>{input.value='';refresh();message.textContent='Image removed from this form. Select “'+saveLabel+'” to save the change.';};
    choose.onclick=()=>picker.click();
    picker.onchange=async()=>{
      const file=picker.files[0]; if(!file)return;
      try {validate(file);} catch(e){message.textContent=e.message;picker.value='';return;}
      const controls=[choose,remove,input,...saveButtons]; const disabled=controls.map(x=>x.disabled);
      controls.forEach(x=>x.disabled=true); message.textContent='Uploading '+file.name+'…';wrap.setAttribute('aria-busy','true');
      try {const url=await upload(db,file,folder);input.value=url;refresh();message.textContent='Image uploaded. Select “'+saveLabel+'” to use it on the website.';}
      catch(e){message.textContent=e.message;}
      finally {controls.forEach((x,i)=>x.disabled=disabled[i]);picker.value='';wrap.removeAttribute('aria-busy');}
    };
    refresh(); return {refresh};
  }
  window.FARMedia={validate,upload,attach};
})();
