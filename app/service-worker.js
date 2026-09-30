const CACHE='fenland-angels-phone-app-v11';

const ASSETS=[
  './',
  './style.css?v=11',
  './app.js?v=11',
  './manifest.webmanifest',
  './fenland-angels-radio-logo.jpg',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install',e=>{
  e.waitUntil(
    caches.open(CACHE).then(c=>c.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate',e=>{
  e.waitUntil(
    caches.keys().then(keys=>
      Promise.all(
        keys
          .filter(k=>k!==CACHE)
          .map(k=>caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);

  if(u.pathname.endsWith('/app/') || u.pathname.endsWith('/app/index.html')){
    e.respondWith(fetch(e.request,{cache:'no-store'}).catch(()=>caches.match('./index.html')));
    return;
  }

  if(
    u.hostname.includes('yesstreaming.net') ||
    e.request.method!=='GET'
  ) return;

  e.respondWith(
    fetch(e.request)
      .then(r=>{
        const copy=r.clone();
        caches.open(CACHE)
          .then(c=>c.put(e.request,copy));
        return r;
      })
      .catch(()=>
        caches.match(e.request)
          .then(x=>x||caches.match('./index.html'))
      )
  );
});
