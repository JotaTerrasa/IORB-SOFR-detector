const CACHE='liquidity-shell-20261013-1';
const SHELL=['./','./index.html','./styles.css?v=20261013_1','./app.js?v=20261013_1','./lib/analytics.js','./lib/migrate.js','./vendor/chart.umd.js?v=4.4.1','./favicon.svg','./icon.svg','./manifest.webmanifest'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  const r=e.request,u=new URL(r.url);
  // Never intercept data, non-GET requests or cross-origin traffic.
  if(r.method!=='GET'||u.origin!==self.location.origin||u.pathname.startsWith('/api/')||u.pathname.endsWith('/sw.js'))return;
  e.respondWith(fetch(r).then(res=>{
    if(res.ok && SHELL.some(p=>new URL(p,self.location).pathname===u.pathname)){const copy=res.clone();e.waitUntil(caches.open(CACHE).then(c=>c.put(r,copy)));}
    return res;
  }).catch(async()=>{const cached=await caches.match(r);if(cached)return cached;if(r.mode==='navigate')return caches.match('./index.html');return new Response('Offline',{status:503});}));
});
self.addEventListener('message',e=>{if(e.data?.type==='SKIP_WAITING')self.skipWaiting();});
