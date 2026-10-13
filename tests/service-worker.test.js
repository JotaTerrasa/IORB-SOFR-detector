import {test} from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';
test('service worker bypasses API data and uses network before shell cache',async()=>{
 const handlers={},store=new Map(),pending=[];let calls=0,offline=false;
 const sandbox={URL,Response,self:{location:new URL('https://dashboard.test/sw.js'),addEventListener:(n,f)=>handlers[n]=f},fetch:async()=>{if(offline)throw new Error('offline');return new Response('network-'+(++calls));},caches:{match:async r=>store.get(typeof r==='string'?r:r.url)?.clone(),open:async()=>({put:async(r,v)=>store.set(r.url,v)})}};
 vm.runInNewContext(await readFile(new URL('../sw.js',import.meta.url),'utf8'),sandbox);
 const event=url=>({request:{url,method:'GET',mode:'cors'},waitUntil:p=>pending.push(p),respondWith:p=>pending.push(p)});
 handlers.fetch(event('https://dashboard.test/api/iorb?cosd=2026-10-01'));assert.equal(pending.length,0);assert.equal(calls,0);
 const a=event('https://dashboard.test/app.js?v=20261013_1');let result;a.respondWith=p=>{result=p;};handlers.fetch(a);assert.equal(await (await result).text(),'network-1');await Promise.all(pending);
 const b=event(a.request.url);b.respondWith=p=>{result=p;};handlers.fetch(b);assert.equal(await (await result).text(),'network-2');await Promise.all(pending);
 offline=true;const c=event(a.request.url);c.respondWith=p=>{result=p;};handlers.fetch(c);assert.equal(await (await result).text(),'network-2');
});
