const CACHE='fenland-angels-phone-app-v5';

const ASSETS=[
  './',
  './index.html',
  './style.css?v=3',
  './app.js?v=5',
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

  if(
    u.hostname.includes('yesstreaming.net') ||
    e.request.method!=='GET'
  ) return;

  e.respondWith(
    fetch(e.request)
      .then(r=>{
        const copy=r.clone();
        caches.open(CACHE).then(c=>c.put(e.request,copy));
        return r;
      })
      .catch(()=>
        caches.match(e.request)
          .then(x=>x||caches.match('./index.html'))
      )
  );
});
